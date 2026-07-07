import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type WebContents } from "electron";
import { asc, desc, eq } from "drizzle-orm";
import type { Thread } from "@openai/codex-sdk";
import type {
  AssistantChatMessage,
  AssistantConversation,
  AssistantProviderId,
  AssistantSendMessageInput,
  AssistantSendMessageResult,
  AssistantStreamEvent,
} from "../../shared/assistant";
import { schema } from "../db";
import type { ServiceContext } from "./context";
import * as decks from "./decks";
import * as browse from "./browse";
import { ipcEvents } from "../../shared/ipc-channels";

const { assistantConversations, assistantMessages } = schema;
const assistantProviderIds = ["codex", "claude-code", "opencode"] as const;

type ConversationState = AssistantConversation & {
  profileId: string;
  codexThread?: Thread;
  claudeSessionId?: string;
  openCodeSessionId?: string;
  openCodeHandle?: Awaited<ReturnType<typeof createOpenCodeHandle>>;
  abortController?: AbortController;
  assistantMessageId?: string;
};

const conversations = new Map<string, ConversationState>();

function isAssistantProviderId(value: string): value is AssistantProviderId {
  return assistantProviderIds.includes(value as AssistantProviderId);
}

function safeProfileId(profileId: string) {
  return profileId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function assistantWorkingDirectory(profileId: string) {
  const dir = join(tmpdir(), "armin-assistant", safeProfileId(profileId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function publicConversation(state: ConversationState): AssistantConversation {
  return {
    id: state.id,
    providerId: state.providerId,
    messages: state.messages,
    busy: state.busy,
  };
}

function messageFromRow(
  row: typeof assistantMessages.$inferSelect,
): AssistantChatMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.getTime(),
  };
}

function stateFromRow(
  ctx: ServiceContext,
  row: typeof assistantConversations.$inferSelect,
): ConversationState | null {
  if (!isAssistantProviderId(row.providerId)) return null;
  const messages = ctx.db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, row.id))
    .orderBy(asc(assistantMessages.createdAt))
    .all()
    .map(messageFromRow)
    .filter((message): message is AssistantChatMessage => Boolean(message));

  return {
    id: row.id,
    providerId: row.providerId,
    profileId: ctx.profileId,
    messages,
    busy: conversations.get(row.id)?.busy ?? false,
  };
}

function emit(webContents: WebContents, event: AssistantStreamEvent) {
  webContents.send(ipcEvents.assistantStream, event);
}

function insertConversation(ctx: ServiceContext, state: ConversationState) {
  const now = new Date();
  ctx.db
    .insert(assistantConversations)
    .values({
      id: state.id,
      providerId: state.providerId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function touchConversation(ctx: ServiceContext, state: ConversationState) {
  ctx.db
    .update(assistantConversations)
    .set({ updatedAt: new Date() })
    .where(eq(assistantConversations.id, state.id))
    .run();
}

function appendMessage(
  ctx: ServiceContext,
  state: ConversationState,
  role: AssistantChatMessage["role"],
  content: string,
  id = randomUUID(),
) {
  const message = { id, role, content, createdAt: Date.now() };
  state.messages.push(message);
  ctx.db
    .insert(assistantMessages)
    .values({
      id: message.id,
      conversationId: state.id,
      role: message.role,
      content: message.content,
      createdAt: new Date(message.createdAt),
    })
    .run();
  touchConversation(ctx, state);
  return message;
}

function updateMessageContent(
  ctx: ServiceContext,
  state: ConversationState,
  message: AssistantChatMessage,
) {
  ctx.db
    .update(assistantMessages)
    .set({ content: message.content })
    .where(eq(assistantMessages.id, message.id))
    .run();
  touchConversation(ctx, state);
}

async function profileContextPrompt(ctx: ServiceContext) {
  const [deckRows, browsePage] = await Promise.all([
    decks.listDecks(ctx),
    browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 40,
      sort: "created-new",
    }),
  ]);

  const deckSummary = deckRows
    .slice(0, 20)
    .map((deck) => `- ${deck.name}: ${deck.total} flashcards`)
    .join("\n");
  const flashcardSummary = browsePage.flashcards
    .slice(0, 20)
    .map(
      (flashcard) =>
        `- [${flashcard.deckName}] ${flashcard.front} -> ${flashcard.back}`,
    )
    .join("\n");

  return [
    "You are Armin's in-app Assistant.",
    "Help the learner create and manage decks, flashcards, and prerequisite graphs.",
    "Apply Armin's study-card guidance: make prompts atomic, clear, and useful for future review.",
    "Default to drafts and explanations. Do not claim you changed study data unless an Armin tool applied it.",
    "Use Armin vocabulary: Profile, Deck, Flashcard, Prerequisite, Prerequisite graph, Review unit.",
    "",
    "Active Profile context:",
    deckSummary ? `Decks:\n${deckSummary}` : "Decks: none yet.",
    flashcardSummary
      ? `Recent flashcards:\n${flashcardSummary}`
      : "Recent flashcards: none yet.",
  ].join("\n");
}

function promptForTurn(
  systemContext: string,
  state: ConversationState,
  userMessage: string,
) {
  const recentHistory = state.messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");

  return [
    systemContext,
    "",
    recentHistory ? `Conversation so far:\n${recentHistory}` : null,
    "",
    `Learner request:\n${userMessage}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function ensureConversation(
  ctx: ServiceContext,
  input: AssistantSendMessageInput,
) {
  if (input.conversationId) {
    const existing = conversations.get(input.conversationId);
    if (existing) {
      if (existing.profileId !== ctx.profileId) {
        throw new Error("Assistant conversation not found for this Profile.");
      }
      if (existing.providerId !== input.providerId) {
        throw new Error("Assistant conversation belongs to a different provider.");
      }
      return existing;
    }

    const row = ctx.db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.id, input.conversationId))
      .get();
    if (!row) throw new Error("Assistant conversation not found for this Profile.");

    const state = stateFromRow(ctx, row);
    if (!state) throw new Error("Assistant conversation has an unsupported provider.");
    if (state.providerId !== input.providerId) {
      throw new Error("Assistant conversation belongs to a different provider.");
    }
    conversations.set(state.id, state);
    return state;
  }

  const state: ConversationState = {
    id: randomUUID(),
    providerId: input.providerId,
    profileId: ctx.profileId,
    messages: [],
    busy: false,
  };
  insertConversation(ctx, state);
  conversations.set(state.id, state);
  return state;
}

async function runCodex(
  state: ConversationState,
  prompt: string,
  workingDirectory: string,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
  onStatus: (message: string) => void,
) {
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex({ env: { ...process.env } as Record<string, string> });
  state.codexThread ??= codex.startThread({
    workingDirectory,
    skipGitRepoCheck: true,
    sandboxMode: "read-only",
    approvalPolicy: "never",
  });

  const streamed = await state.codexThread.runStreamed(prompt, { signal });
  const itemText = new Map<string, string>();
  let finalText = "";

  for await (const event of streamed.events) {
    if (signal.aborted) break;
    if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
      if (event.item.type === "agent_message") {
        const previous = itemText.get(event.item.id) ?? "";
        const next = event.item.text;
        const delta = next.startsWith(previous) ? next.slice(previous.length) : next;
        if (delta) onDelta(delta);
        itemText.set(event.item.id, next);
        finalText = next;
      } else if (event.item.type === "mcp_tool_call") {
        onStatus(`Using ${event.item.server}.${event.item.tool}`);
      } else if (event.item.type === "web_search") {
        onStatus(`Searching: ${event.item.query}`);
      }
    } else if (event.type === "turn.failed") {
      throw new Error(event.error.message);
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return finalText;
}

function textFromClaudeMessage(message: unknown) {
  const content = (message as { message?: { content?: unknown[] } }).message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (block && typeof block === "object" && "type" in block) {
        const typed = block as { type: string; text?: string };
        if (typed.type === "text") return typed.text ?? "";
      }
      return "";
    })
    .join("");
}

async function runClaudeCode(
  state: ConversationState,
  prompt: string,
  workingDirectory: string,
  abortController: AbortController,
  onDelta: (delta: string) => void,
) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const stream = query({
    prompt,
    options: {
      abortController,
      cwd: workingDirectory,
      resume: state.claudeSessionId,
      permissionMode: "dontAsk",
      allowedTools: [],
      settingSources: [],
    },
  });

  let finalText = "";
  for await (const message of stream) {
    if (message.type === "assistant") {
      state.claudeSessionId = message.session_id;
      const text = textFromClaudeMessage(message);
      if (text) {
        onDelta(text);
        finalText += text;
      }
    } else if (message.type === "result") {
      state.claudeSessionId = message.session_id;
      if (message.subtype === "success" && !finalText && message.result) {
        onDelta(message.result);
        finalText = message.result;
      } else if (message.subtype !== "success") {
        throw new Error(message.errors.join("\n") || "Claude Code failed.");
      }
    }
  }
  return finalText;
}

async function createOpenCodeHandle() {
  const { createOpencode } = await import("@opencode-ai/sdk");
  return createOpencode({ hostname: "127.0.0.1", timeout: 10_000 });
}

function textFromOpenCodeResponse(response: unknown) {
  const data = (response as { data?: { parts?: unknown[] } }).data;
  if (!Array.isArray(data?.parts)) return "";
  return data.parts
    .map((part) => {
      if (part && typeof part === "object" && "type" in part) {
        const typed = part as { type: string; text?: string };
        if (typed.type === "text") return typed.text ?? "";
      }
      return "";
    })
    .join("");
}

async function runOpenCode(
  state: ConversationState,
  prompt: string,
  workingDirectory: string,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
) {
  state.openCodeHandle ??= await createOpenCodeHandle();
  const { client } = state.openCodeHandle;
  if (!state.openCodeSessionId) {
    const session = await client.session.create({
      body: { title: "Armin Assistant" },
      query: { directory: workingDirectory },
    } as never);
    state.openCodeSessionId = (session as { data?: { id?: string } }).data?.id;
  }
  if (!state.openCodeSessionId) throw new Error("OpenCode did not create a session.");

  const response = await client.session.prompt({
    path: { id: state.openCodeSessionId },
    query: { directory: workingDirectory },
    body: {
      parts: [{ type: "text", text: prompt }],
    },
    signal,
  } as never);
  const text = textFromOpenCodeResponse(response);
  if (text) onDelta(text);
  return text;
}

async function runProvider(
  state: ConversationState,
  prompt: string,
  workingDirectory: string,
  abortController: AbortController,
  onDelta: (delta: string) => void,
  onStatus: (message: string) => void,
) {
  if (state.providerId === "codex") {
    return runCodex(
      state,
      prompt,
      workingDirectory,
      abortController.signal,
      onDelta,
      onStatus,
    );
  }
  if (state.providerId === "claude-code") {
    return runClaudeCode(state, prompt, workingDirectory, abortController, onDelta);
  }
  return runOpenCode(state, prompt, workingDirectory, abortController.signal, onDelta);
}

export function listAssistantConversations(ctx: ServiceContext) {
  return ctx.db
    .select()
    .from(assistantConversations)
    .orderBy(desc(assistantConversations.updatedAt))
    .all()
    .map((row) => {
      const runtime = conversations.get(row.id);
      if (runtime?.profileId === ctx.profileId) return runtime;

      const state = stateFromRow(ctx, row);
      if (state) conversations.set(state.id, state);
      return state;
    })
    .filter((state): state is ConversationState => Boolean(state))
    .map(publicConversation);
}

export async function sendAssistantMessage({
  ctx,
  webContents,
  input,
}: {
  ctx: ServiceContext;
  webContents: WebContents;
  input: AssistantSendMessageInput;
}): Promise<AssistantSendMessageResult> {
  const state = ensureConversation(ctx, input);
  if (state.busy) throw new Error("Assistant is already responding.");

  const userMessage = appendMessage(ctx, state, "user", input.message);
  const assistantMessage = appendMessage(ctx, state, "assistant", "");
  const requestId = randomUUID();
  const abortController = new AbortController();
  state.abortController = abortController;
  state.assistantMessageId = assistantMessage.id;
  state.busy = true;

  emit(webContents, {
    type: "started",
    conversationId: state.id,
    requestId,
    assistantMessageId: assistantMessage.id,
  });

  void (async () => {
    try {
      const systemContext = await profileContextPrompt(ctx);
      const prompt = promptForTurn(systemContext, state, userMessage.content);
      const workingDirectory = assistantWorkingDirectory(ctx.profileId);
      let content = "";
      const delta = (text: string) => {
        content += text;
        assistantMessage.content = content;
        updateMessageContent(ctx, state, assistantMessage);
        emit(webContents, {
          type: "delta",
          conversationId: state.id,
          requestId,
          messageId: assistantMessage.id,
          delta: text,
        });
      };
      const status = (message: string) => {
        emit(webContents, {
          type: "status",
          conversationId: state.id,
          requestId,
          message,
        });
      };
      const finalText = await runProvider(
        state,
        prompt,
        workingDirectory,
        abortController,
        delta,
        status,
      );
      if (!content && finalText) assistantMessage.content = finalText;
      updateMessageContent(ctx, state, assistantMessage);
      emit(webContents, {
        type: "done",
        conversationId: state.id,
        requestId,
        messageId: assistantMessage.id,
        content: assistantMessage.content,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant failed.";
      assistantMessage.content = message;
      updateMessageContent(ctx, state, assistantMessage);
      emit(webContents, {
        type: "error",
        conversationId: state.id,
        requestId,
        message,
      });
    } finally {
      state.busy = false;
      state.abortController = undefined;
      state.assistantMessageId = undefined;
    }
  })();

  return { conversation: publicConversation(state), requestId };
}

export async function cancelAssistantConversation(
  profileId: string,
  conversationId: string,
) {
  const state = conversations.get(conversationId);
  if (!state || state.profileId !== profileId) return;
  state.abortController?.abort();
  state.busy = false;
}
