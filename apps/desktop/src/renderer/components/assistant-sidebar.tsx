import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ExternalLink, Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ui/ai/conversation";
import {
  Message,
  MessageContent,
  MessageLoader,
} from "@/components/ui/ai/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from "@/components/ui/ai/prompt-input";
import { Response } from "@/components/ui/ai/response";
import { assistantKeys } from "@/lib/armin-query";
import { cn } from "@/lib/utils";
import type {
  AssistantChatMessage,
  AssistantConversation,
  AssistantProvider,
  AssistantProviderId,
  AssistantStreamEvent,
} from "../../shared/assistant";

function statusLabel(provider: AssistantProvider) {
  const { status } = provider;
  if (status.state === "ready") return "Ready";
  if (status.state === "not_installed") return "Not installed";
  if (status.state === "installed_not_authenticated") return "Sign in required";
  if (status.state === "installed_not_configured") return "Configuration required";
  return "Needs attention";
}

function statusTone(provider: AssistantProvider) {
  if (provider.status.state === "ready") {
    return "border border-easy/30 bg-easy/10 text-easy-deep";
  }
  if (provider.status.state === "error") {
    return "border border-again/30 bg-again/10 text-again-deep";
  }
  return "border border-border bg-surface-sunken text-muted";
}

function setupText(provider: AssistantProvider) {
  const { status } = provider;
  if (status.state === "ready") {
    return status.accountLabel
      ? `Connected as ${status.accountLabel}.`
      : "This provider is ready for Assistant conversations.";
  }
  if (status.state === "not_installed") {
    return "Install this provider locally, then come back and check again.";
  }
  if (status.state === "installed_not_authenticated") {
    return "This provider is installed. Finish sign-in with the provider, then check again.";
  }
  if (status.state === "installed_not_configured") {
    return "This provider is installed. Configure a usable model provider, then check again.";
  }
  return status.message;
}

function actionLabel(provider: AssistantProvider) {
  const { status } = provider;
  if (status.state === "not_installed") return "Install instructions";
  if (status.state === "installed_not_authenticated") return status.connectLabel;
  if (status.state === "installed_not_configured") return "Configuration help";
  return "Provider help";
}

function canOpenProviderUrl(provider: AssistantProvider) {
  return provider.status.state !== "ready";
}

function ProviderCard({ provider }: { provider: AssistantProvider }) {
  const queryClient = useQueryClient();
  const openProviderUrl = async () => {
    await window.armin.assistant.openProviderUrl(provider.id);
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{provider.name}</h3>
          <p className="mt-1 text-pretty text-[0.8125rem] leading-snug text-muted">
            {provider.description}
          </p>
        </div>
        <Badge className={cn("shrink-0", statusTone(provider))}>
          {statusLabel(provider)}
        </Badge>
      </div>

      <p className="mt-3 text-pretty text-[0.8125rem] leading-snug text-muted">
        {setupText(provider)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {canOpenProviderUrl(provider) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openProviderUrl()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {actionLabel(provider)}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            void queryClient.invalidateQueries({ queryKey: assistantKeys.providers })
          }
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Check again
        </Button>
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: AssistantChatMessage }) {
  const fromUser = message.role === "user";
  return (
    <Message from={fromUser ? "user" : "assistant"}>
      <MessageContent>
        {fromUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : message.content ? (
          <Response>{message.content}</Response>
        ) : (
          <MessageLoader />
        )}
      </MessageContent>
    </Message>
  );
}

function applyStreamEvent(
  conversation: AssistantConversation | null,
  event: AssistantStreamEvent,
): AssistantConversation | null {
  if (!conversation || conversation.id !== event.conversationId) return conversation;
  if (event.type === "started") return { ...conversation, busy: true };
  if (event.type === "delta") {
    return {
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === event.messageId
          ? { ...message, content: message.content + event.delta }
          : message,
      ),
    };
  }
  if (event.type === "done") {
    return {
      ...conversation,
      busy: false,
      messages: conversation.messages.map((message) =>
        message.id === event.messageId
          ? { ...message, content: event.content }
          : message,
      ),
    };
  }
  if (event.type === "error") {
    return {
      ...conversation,
      busy: false,
      messages: conversation.messages.map((message, index, messages) =>
        index === messages.length - 1 && message.role === "assistant"
          ? { ...message, content: event.message }
          : message,
      ),
    };
  }
  return conversation;
}

function conversationTitle(conversation: AssistantConversation) {
  const firstUserMessage = conversation.messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );
  return firstUserMessage?.content.trim().slice(0, 56) || "New conversation";
}

function upsertConversation(
  conversations: AssistantConversation[] | undefined,
  conversation: AssistantConversation,
) {
  const rest = (conversations ?? []).filter((item) => item.id !== conversation.id);
  return [conversation, ...rest];
}

export function AssistantSidebar({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: assistantKeys.providers,
    queryFn: () => window.armin.assistant.listProviders(),
  });
  const providers = providersQuery.data ?? [];
  const readyProviders = providers.filter(
    (provider) => provider.status.state === "ready",
  );
  const [selectedProviderId, setSelectedProviderId] =
    useState<AssistantProviderId | null>(null);
  const [conversation, setConversation] = useState<AssistantConversation | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const restoredInitialConversation = useRef(false);

  const conversationsQuery = useQuery({
    queryKey: assistantKeys.conversations,
    queryFn: () => window.armin.assistant.listConversations(),
    enabled: readyProviders.length > 0,
  });
  const savedConversations = conversationsQuery.data ?? [];
  const providerConversations = savedConversations.filter(
    (item) => item.providerId === selectedProviderId,
  );

  useEffect(() => {
    if (!selectedProviderId && readyProviders[0]) {
      setSelectedProviderId(readyProviders[0].id);
    }
  }, [readyProviders, selectedProviderId]);

  useEffect(() => {
    if (
      restoredInitialConversation.current ||
      conversation ||
      !selectedProviderId ||
      !providerConversations[0]
    ) {
      return;
    }
    restoredInitialConversation.current = true;
    setConversation(providerConversations[0]);
  }, [conversation, providerConversations, selectedProviderId]);

  useEffect(() => {
    return window.armin.assistant.onStream((event) => {
      if (event.type === "status") {
        setStatus(event.message);
        return;
      }
      if (event.type === "started") setStatus("Thinking…");
      if (event.type === "done") setStatus(null);
      if (event.type === "error") setStatus(null);
      setConversation((current) => {
        const updated = applyStreamEvent(current, event);
        if (updated) {
          queryClient.setQueryData<AssistantConversation[]>(
            assistantKeys.conversations,
            (currentConversations) => upsertConversation(currentConversations, updated),
          );
        }
        return updated;
      });
    });
  }, [queryClient]);

  const selectedProvider = readyProviders.find(
    (provider) => provider.id === selectedProviderId,
  );
  const canSend = Boolean(
    selectedProvider && draft.trim() && !conversation?.busy,
  );

  const selectProvider = (id: AssistantProviderId) => {
    setSelectedProviderId(id);
    setConversation(
      savedConversations.find((item) => item.providerId === id) ?? null,
    );
    setStatus(null);
  };

  const startNewConversation = () => {
    restoredInitialConversation.current = true;
    setConversation(null);
    setStatus(null);
  };

  const sendMessage = async () => {
    if (!selectedProvider || !draft.trim()) return;
    const message = draft.trim();
    setDraft("");
    setStatus("Starting…");
    const result = await window.armin.assistant.sendMessage({
      conversationId: conversation?.id,
      providerId: selectedProvider.id,
      message,
    });
    setConversation(result.conversation);
    queryClient.setQueryData<AssistantConversation[]>(
      assistantKeys.conversations,
      (currentConversations) =>
        upsertConversation(currentConversations, result.conversation),
    );
  };

  const cancel = async () => {
    if (!conversation?.id) return;
    await window.armin.assistant.cancel(conversation.id);
    setConversation((current) =>
      current ? { ...current, busy: false } : current,
    );
    setStatus(null);
  };

  const hasReadyProviders = readyProviders.length > 0;

  return (
    <aside className="animate-fade-in flex h-full w-full max-w-[380px] shrink-0 flex-col border-l border-border bg-bg shadow-[var(--armin-shadow-sidebar)]">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-accent" strokeWidth={1.8} />
            <h2 className="text-sm font-semibold text-ink">Assistant</h2>
          </div>
          <p className="mt-1 text-pretty text-[0.8125rem] leading-snug text-muted">
            Create decks, flashcards, and prerequisite graphs with your local AI
            provider.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close Assistant"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {providersQuery.isLoading ? (
        <div className="min-h-0 flex-1 space-y-3 px-5 py-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <span className="sr-only">Checking local providers…</span>
        </div>
      ) : providersQuery.isError ? (
        <div className="min-h-0 flex-1 px-5 py-4">
          <div className="rounded-xl border border-again/30 bg-again/10 p-4">
            <p className="text-sm font-medium text-again-deep">
              Couldn&apos;t check providers
            </p>
            <p className="mt-1 text-pretty text-[0.8125rem] leading-snug text-muted">
              Armin could not inspect local provider installations.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void providersQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : hasReadyProviders ? (
        <>
          <div className="flex flex-col gap-3 border-b border-border px-5 py-3">
            {readyProviders.length > 1 && (
              <Segmented
                size="sm"
                value={selectedProviderId ?? readyProviders[0].id}
                onChange={selectProvider}
                options={readyProviders.map((provider) => ({
                  value: provider.id,
                  label: provider.name,
                }))}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Conversations
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={startNewConversation}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            </div>
            {providerConversations.length > 0 && (
              <div className="armin-scrollbar armin-scrollbar-gutter-bg flex gap-2 overflow-x-auto pb-1">
                {providerConversations.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={conversation?.id === item.id ? "subtle" : "ghost"}
                    size="sm"
                    className="max-w-[13rem] shrink-0 justify-start truncate"
                    onClick={() => {
                      setConversation(item);
                      setStatus(null);
                    }}
                  >
                    <span className="truncate">{conversationTitle(item)}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>

          <Conversation className="min-h-0 flex-1">
            <ConversationContent>
              {conversation?.messages.length ? (
                <>
                  {conversation.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  {status && (
                    <p className="px-1 text-xs font-medium text-muted">{status}</p>
                  )}
                </>
              ) : (
                <ConversationEmptyState
                  icon={<Bot className="h-6 w-6" strokeWidth={1.5} />}
                  title="Ask for a deck, flashcards, or a prerequisite graph"
                  description={`The Assistant can read this Profile and draft study material using ${
                    selectedProvider?.name ?? "your selected provider"
                  }.`}
                />
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t border-border px-5 py-3">
            <PromptInput onSubmit={() => canSend && void sendMessage()}>
              <PromptInputTextarea
                value={draft}
                placeholder="Ask the Assistant to create flashcards…"
                aria-label="Message the Assistant"
                disabled={!selectedProvider || conversation?.busy}
                onChange={(event) => setDraft(event.target.value)}
              />
              <PromptInputToolbar>
                <p className="min-w-0 truncate text-xs text-muted">
                  {selectedProvider
                    ? `Using ${selectedProvider.name}`
                    : "Select a provider"}
                </p>
                {conversation?.busy ? (
                  <PromptInputSubmit
                    type="button"
                    status="streaming"
                    variant="outline"
                    aria-label="Stop generating"
                    onClick={() => void cancel()}
                  />
                ) : (
                  <PromptInputSubmit
                    status="ready"
                    aria-label="Send message"
                    disabled={!canSend}
                  />
                )}
              </PromptInputToolbar>
            </PromptInput>
            <p className="mt-1.5 flex items-center gap-1 px-1 text-[0.6875rem] text-muted">
              <Kbd>↵</Kbd>
              <span>to send</span>
              <span aria-hidden>·</span>
              <Kbd>⇧</Kbd>
              <Kbd>↵</Kbd>
              <span>for a new line</span>
            </p>
          </div>
        </>
      ) : (
        <div className="armin-scrollbar armin-scrollbar-gutter-bg min-h-0 flex-1 space-y-3 px-5 py-4">
          <div className="rounded-xl border border-border bg-surface-sunken p-4">
            <p className="text-sm font-medium text-ink">Choose a provider</p>
            <p className="mt-1 text-pretty text-[0.8125rem] leading-snug text-muted">
              Install and sign in to Codex, Claude Code, or OpenCode to use the
              Assistant.
            </p>
          </div>

          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}

          <p className="text-pretty text-[0.6875rem] leading-snug text-muted">
            Armin detects local installations only. It does not install providers
            or store subscription credentials.
          </p>
        </div>
      )}
    </aside>
  );
}
