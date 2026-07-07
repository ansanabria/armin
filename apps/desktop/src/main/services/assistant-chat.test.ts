import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userData = vi.hoisted(() => {
  let dir = "";
  return {
    get: () => dir,
    set: (next: string) => {
      dir = next;
    },
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") return userData.get();
      throw new Error(`Unexpected getPath: ${name}`);
    },
  },
}));

import { closeDb, schema, setDbRootForTests } from "../db";
import { ensureProfileReady, resetProfileRuntime } from "../profiles/runtime";
import type { ServiceContext } from "./context";
import { listAssistantConversations } from "./assistant-chat";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-assistant-chat-"));
  setDbRootForTests(root);
  userData.set(root);
});

afterEach(() => {
  closeDb();
  resetProfileRuntime();
  setDbRootForTests(null);
  userData.set("");
  fs.rmSync(root, { recursive: true, force: true });
});

async function makeCtx(profileId: string): Promise<ServiceContext> {
  return ensureProfileReady(profileId);
}

function seedConversation(ctx: ServiceContext, id: string, prompt: string) {
  const now = new Date("2026-01-01T00:00:00.000Z");
  ctx.db
    .insert(schema.assistantConversations)
    .values({ id, providerId: "codex", createdAt: now, updatedAt: now })
    .run();
  ctx.db
    .insert(schema.assistantMessages)
    .values([
      {
        id: `${id}-user`,
        conversationId: id,
        role: "user",
        content: prompt,
        createdAt: now,
      },
      {
        id: `${id}-assistant`,
        conversationId: id,
        role: "assistant",
        content: "Drafted a study plan.",
        createdAt: new Date(now.getTime() + 1),
      },
    ])
    .run();
}

describe("Assistant conversations", () => {
  it("lists persisted Assistant conversations only for the active Profile", async () => {
    const calculus = await makeCtx("calculus-profile");
    const chemistry = await makeCtx("chemistry-profile");
    seedConversation(calculus, "calculus-conversation", "Make calculus flashcards");
    seedConversation(chemistry, "chemistry-conversation", "Make chemistry flashcards");

    const conversations = listAssistantConversations(calculus);

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: "calculus-conversation",
      providerId: "codex",
      busy: false,
    });
    expect(conversations[0].messages.map((message) => message.content)).toEqual([
      "Make calculus flashcards",
      "Drafted a study plan.",
    ]);
  });
});
