import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getDb, initDb } from "../main/db";
import { runMigrations } from "../main/db/migrate";
import type { ServiceContext } from "../main/services/context";
import { isFlashcardType } from "../main/services/flashcard-types";
import { createDeck, listDecks } from "../main/services/decks";
import { addPrereq } from "../main/services/graph";
import {
  createFlashcard,
  getFlashcard,
  listFlashcards,
} from "../main/services/flashcards";
import type { McpSessionProfile } from "../shared/mcp-session";
import { importFlashcardHierarchy, readDeckGraph } from "./import-hierarchy";

export type ArminMcpState = {
  activeProfileId: string | null;
  openProfiles: McpSessionProfile[];
};

export type ArminMcpStateProvider = () => ArminMcpState;

function jsonResult<T extends Record<string, unknown>>(value: T) {
  const text = JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: value,
  };
}

const idSchema = z.string().min(1);

function profileLabel(profile: McpSessionProfile) {
  return profile.name ? `${profile.name} (${profile.id})` : profile.id;
}

export function createArminMcpServer(getState: ArminMcpStateProvider) {
  const server = new McpServer(
    {
      name: "armin",
      version: "0.2.0",
    },
    {
      instructions:
        "Use Armin to create study flashcards and prerequisite hierarchies. If multiple Armin profiles are open, call list_open_profiles, ask the user which profile to use, then call select_profile before creating or reading flashcards. Prefer import_flashcard_hierarchy when creating multiple related flashcards: assign stable clientId values, set prerequisites to those clientIds, and submit the whole hierarchy in one call. Flashcards should be atomic, accurate, and ordered from foundations to dependents.",
    },
  );

  let selectedProfileId: string | null = null;

  function currentState() {
    const state = getState();
    const openProfiles = state.openProfiles;
    const activeProfileId =
      openProfiles.length === 1 ? openProfiles[0].id : state.activeProfileId;
    return { activeProfileId, openProfiles };
  }

  function selectedOrActiveProfileId() {
    const { activeProfileId, openProfiles } = currentState();
    if (
      selectedProfileId &&
      openProfiles.some((profile) => profile.id === selectedProfileId)
    ) {
      return selectedProfileId;
    }
    selectedProfileId = null;
    if (openProfiles.length > 1) return null;
    return activeProfileId;
  }

  function requireKnownProfile(profileId: string) {
    const profile = currentState().openProfiles.find(
      (candidate) => candidate.id === profileId,
    );
    if (!profile) {
      throw new Error(`Profile ${profileId} is not open in Armin.`);
    }
    return profile;
  }

  function requireSelectedProfile() {
    const profileId = selectedOrActiveProfileId();
    if (profileId) return profileId;

    const { openProfiles } = currentState();
    if (openProfiles.length === 0) {
      throw new Error(
        "No Armin profile is open. Open Armin and select a profile before using MCP.",
      );
    }

    const labels = openProfiles.map(profileLabel).join(", ");
    throw new Error(
      `Multiple Armin profiles are open: ${labels}. Ask the user which profile to use, then call select_profile with that profileId.`,
    );
  }

  function ctx(): ServiceContext {
    const profileId = requireSelectedProfile();
    return { profileId, db: getDb(profileId) };
  }

  async function ensureProfileReady(profileId: string) {
    await initDb(profileId);
    await runMigrations(profileId);
  }

  async function withSelectedProfile<T>(handler: () => Promise<T>) {
    await ensureProfileReady(requireSelectedProfile());
    return await handler();
  }

  server.registerTool(
    "list_open_profiles",
    {
      title: "List Open Profiles",
      description:
        "List Armin profiles currently open in the desktop app. Use this before select_profile when multiple profiles are open.",
      inputSchema: z.object({}),
    },
    async () => {
      const { activeProfileId, openProfiles } = currentState();
      return jsonResult({
        activeProfileId: selectedProfileId ?? activeProfileId,
        profiles: openProfiles,
        needsSelection:
          !selectedProfileId && !activeProfileId && openProfiles.length > 1,
      });
    },
  );

  server.registerTool(
    "select_profile",
    {
      title: "Select Profile",
      description:
        "Select which open Armin profile this MCP server should use for the rest of the session.",
      inputSchema: z.object({
        profileId: idSchema.describe(
          "ID of one of the profiles returned by list_open_profiles.",
        ),
      }),
    },
    async ({ profileId }) => {
      const profile = requireKnownProfile(profileId);
      await ensureProfileReady(profile.id);
      selectedProfileId = profile.id;
      return jsonResult({ ok: true, profile });
    },
  );

  server.registerTool(
    "list_decks",
    {
      title: "List Decks",
      description: "List Armin decks and basic review-unit/flashcard counts.",
      inputSchema: z.object({}),
    },
    async () =>
      withSelectedProfile(async () =>
        jsonResult({ decks: await listDecks(ctx()) }),
      ),
  );

  server.registerTool(
    "create_deck",
    {
      title: "Create Deck",
      description: "Create a deck that flashcards can be imported into.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Deck name."),
        description: z
          .string()
          .nullish()
          .describe("Optional deck description or source summary."),
      }),
    },
    async (input) =>
      withSelectedProfile(async () =>
        jsonResult({ deck: await createDeck(ctx(), input) }),
      ),
  );

  server.registerTool(
    "create_flashcard",
    {
      title: "Create Flashcard",
      description:
        "Create one flashcard in an existing deck. Use import_flashcard_hierarchy for batch hierarchy creation.",
      inputSchema: z.object({
        deckId: idSchema.describe("Destination deck ID."),
        front: z
          .string()
          .optional()
          .describe(
            "Flashcard front (basic types). Shorthand for content.front.",
          ),
        back: z
          .string()
          .optional()
          .describe(
            "Flashcard back (basic types). Shorthand for content.back.",
          ),
        type: z
          .string()
          .optional()
          .describe(
            "Flashcard type: basic | basic_reversed | cloze | type_answer | diagram. Defaults to basic.",
          ),
        content: z
          .record(z.string(), z.any())
          .optional()
          .describe(
            'Type-specific content object. Defaults to { front, back } for basic. Cloze uses { text } with numbered deletions written {{N::answer}} (e.g. "The {{1::mitochondria}} is the powerhouse of the {{2::cell}}."); each distinct number is one review, reuse a number to blank several together, and add a hint with {{N::answer::hint}}.',
          ),
      }),
    },
    async (input) =>
      withSelectedProfile(async () => {
        const rawType = input.type ?? "basic";
        if (!isFlashcardType(rawType)) {
          throw new Error(`Unknown flashcard type: ${rawType}`);
        }
        const content = input.content ?? {
          front: input.front,
          back: input.back,
        };
        const flashcard = await createFlashcard({
          ctx: ctx(),
          deckId: input.deckId,
          type: rawType,
          content,
        });
        return jsonResult({ flashcard });
      }),
  );

  server.registerTool(
    "add_prerequisite",
    {
      title: "Add Prerequisite",
      description:
        "Connect two existing flashcards in the same deck. The prerequisite flashcard must be learned before the dependent flashcard unlocks.",
      inputSchema: z.object({
        prereqId: idSchema.describe(
          "Flashcard ID for the prerequisite concept.",
        ),
        dependentId: idSchema.describe(
          "Flashcard ID for the concept that depends on it.",
        ),
      }),
    },
    async ({ prereqId, dependentId }) =>
      withSelectedProfile(async () => {
        await addPrereq(ctx(), prereqId, dependentId);
        return jsonResult({ ok: true, edge: { prereqId, dependentId } });
      }),
  );

  server.registerTool(
    "import_flashcard_hierarchy",
    {
      title: "Import Flashcard Hierarchy",
      description:
        "Create many flashcards and prerequisite edges in one call. Use clientId values to describe the hierarchy before real Armin flashcard IDs exist.",
      inputSchema: z
        .object({
          deckId: idSchema
            .optional()
            .describe(
              "Existing deck ID. If omitted, deckName is used to create a deck.",
            ),
          deckName: z
            .string()
            .min(1)
            .optional()
            .describe("New deck name when deckId is omitted."),
          deckDescription: z
            .string()
            .nullish()
            .describe("Optional description for a newly created deck."),
          flashcards: z
            .array(
              z.object({
                clientId: idSchema.describe(
                  "Temporary ID chosen by the agent for linking prerequisites.",
                ),
                front: z
                  .string()
                  .optional()
                  .describe("Flashcard front (basic types)."),
                back: z
                  .string()
                  .optional()
                  .describe("Flashcard back (basic types)."),
                type: z
                  .string()
                  .optional()
                  .describe(
                    "Flashcard type: basic | basic_reversed | cloze | type_answer | diagram. Defaults to basic.",
                  ),
                content: z
                  .record(z.string(), z.any())
                  .optional()
                  .describe(
                    'Type-specific content object. Defaults to { front, back } for basic. Cloze uses { text } with numbered deletions written {{N::answer}} (e.g. "The {{1::mitochondria}} is the powerhouse of the {{2::cell}}."); each distinct number is one review, reuse a number to blank several together, and add a hint with {{N::answer::hint}}.',
                  ),
                prerequisites: z
                  .array(idSchema)
                  .optional()
                  .describe(
                    "clientId values for flashcards that must be learned before this flashcard.",
                  ),
              }),
            )
            .min(1),
        })
        .refine((input) => input.deckId || input.deckName, {
          message: "Either deckId or deckName is required.",
        }),
    },
    async (input) =>
      withSelectedProfile(async () =>
        jsonResult(await importFlashcardHierarchy(ctx(), input)),
      ),
  );

  server.registerTool(
    "get_deck_graph",
    {
      title: "Get Deck Graph",
      description: "Read flashcards and prerequisite edges for a deck.",
      inputSchema: z.object({
        deckId: idSchema.describe("Deck ID to inspect."),
      }),
    },
    async ({ deckId }) =>
      withSelectedProfile(async () =>
        jsonResult(await readDeckGraph(ctx(), deckId)),
      ),
  );

  server.registerTool(
    "list_flashcards",
    {
      title: "List Flashcards",
      description: "List flashcards in a deck.",
      inputSchema: z.object({
        deckId: idSchema.describe("Deck ID to inspect."),
      }),
    },
    async ({ deckId }) =>
      withSelectedProfile(async () =>
        jsonResult({ flashcards: await listFlashcards(ctx(), deckId) }),
      ),
  );

  server.registerTool(
    "get_flashcard",
    {
      title: "Get Flashcard",
      description: "Read one flashcard by ID.",
      inputSchema: z.object({
        id: idSchema.describe("Flashcard ID."),
      }),
    },
    async ({ id }) =>
      withSelectedProfile(async () =>
        jsonResult({ flashcard: await getFlashcard(ctx(), id) }),
      ),
  );

  return server;
}
