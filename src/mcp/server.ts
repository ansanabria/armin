import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { closeDb, getDb, initDb } from "../main/db";
import { runMigrations } from "../main/db/migrate";
import { createNote, getNote, listNotes } from "../main/services/notes";
import { isCardType } from "../main/services/card-types";
import { createDeck, listDecks } from "../main/services/decks";
import { addPrereq } from "../main/services/graph";
import type { ServiceContext } from "../main/services/context";
import { importCardHierarchy, readDeckGraph } from "./import-hierarchy";

const server = new McpServer(
  {
    name: "armin",
    version: "0.1.0",
  },
  {
    instructions:
      "Use Armin to create study cards and prerequisite hierarchies. Prefer import_card_hierarchy when creating multiple related cards: assign stable clientId values, set prerequisites to those clientIds, and submit the whole hierarchy in one call. Cards should be atomic, accurate, and ordered from foundations to dependents.",
  },
);

function jsonResult<T extends Record<string, unknown>>(value: T) {
  const text = JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: value,
  };
}

const idSchema = z.string().min(1);
const profileId = process.env.ARMIN_PROFILE_ID ?? "mcp";

function ctx(): ServiceContext {
  return { profileId, db: getDb(profileId) };
}

server.registerTool(
  "list_decks",
  {
    title: "List Decks",
    description: "List Armin decks and basic review/card counts.",
    inputSchema: z.object({}),
  },
  async () => jsonResult({ decks: await listDecks(ctx()) }),
);

server.registerTool(
  "create_deck",
  {
    title: "Create Deck",
    description: "Create a deck that cards can be imported into.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Deck name."),
      description: z
        .string()
        .nullish()
        .describe("Optional deck description or source summary."),
    }),
  },
  async (input) => jsonResult({ deck: await createDeck(ctx(), input) }),
);

server.registerTool(
  "create_card",
  {
    title: "Create Card",
    description:
      "Create one card in an existing deck. Use import_card_hierarchy for batch hierarchy creation.",
    inputSchema: z.object({
      deckId: idSchema.describe("Destination deck ID."),
      front: z
        .string()
        .optional()
        .describe("Card front (basic types). Shorthand for content.front."),
      back: z
        .string()
        .optional()
        .describe("Card back (basic types). Shorthand for content.back."),
      type: z
        .string()
        .optional()
        .describe(
          "Card type: basic | basic_reversed | cloze | type_answer | diagram. Defaults to basic.",
        ),
      content: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "Type-specific content object. Defaults to { front, back } for basic. Cloze uses { text } with numbered deletions written {{N::answer}} (e.g. \"The {{1::mitochondria}} is the powerhouse of the {{2::cell}}.\"); each distinct number is one review, reuse a number to blank several together, and add a hint with {{N::answer::hint}}.",
        ),
    }),
  },
  async (input) => {
    const rawType = input.type ?? "basic";
    if (!isCardType(rawType)) {
      throw new Error(`Unknown card type: ${rawType}`);
    }
    const content = input.content ?? { front: input.front, back: input.back };
    const card = await createNote({
      ctx: ctx(),
      deckId: input.deckId,
      type: rawType,
      content,
    });
    return jsonResult({ card });
  },
);

server.registerTool(
  "add_prerequisite",
  {
    title: "Add Prerequisite",
    description:
      "Connect two existing cards in the same deck. The prerequisite card must be learned before the dependent card unlocks.",
    inputSchema: z.object({
      prereqId: idSchema.describe("Card ID for the prerequisite concept."),
      dependentId: idSchema.describe(
        "Card ID for the concept that depends on it.",
      ),
    }),
  },
  async ({ prereqId, dependentId }) => {
    await addPrereq(ctx(), prereqId, dependentId);
    return jsonResult({ ok: true, edge: { prereqId, dependentId } });
  },
);

server.registerTool(
  "import_card_hierarchy",
  {
    title: "Import Card Hierarchy",
    description:
      "Create many cards and prerequisite edges in one call. Use clientId values to describe the hierarchy before real Armin card IDs exist.",
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
        cards: z
          .array(
            z.object({
              clientId: idSchema.describe(
                "Temporary ID chosen by the agent for linking prerequisites.",
              ),
              front: z
                .string()
                .optional()
                .describe("Card front (basic types)."),
              back: z
                .string()
                .optional()
                .describe("Card back (basic types)."),
              type: z
                .string()
                .optional()
                .describe(
                  "Card type: basic | basic_reversed | cloze | type_answer | diagram. Defaults to basic.",
                ),
              content: z
                .record(z.string(), z.any())
                .optional()
                .describe(
                  "Type-specific content object. Defaults to { front, back } for basic. Cloze uses { text } with numbered deletions written {{N::answer}} (e.g. \"The {{1::mitochondria}} is the powerhouse of the {{2::cell}}.\"); each distinct number is one review, reuse a number to blank several together, and add a hint with {{N::answer::hint}}.",
                ),
              prerequisites: z
                .array(idSchema)
                .optional()
                .describe(
                  "clientId values for cards that must be learned before this card.",
                ),
            }),
          )
          .min(1),
      })
      .refine((input) => input.deckId || input.deckName, {
        message: "Either deckId or deckName is required.",
      }),
  },
  async (input) => jsonResult(await importCardHierarchy(ctx(), input)),
);

server.registerTool(
  "get_deck_graph",
  {
    title: "Get Deck Graph",
    description: "Read cards and prerequisite edges for a deck.",
    inputSchema: z.object({
      deckId: idSchema.describe("Deck ID to inspect."),
    }),
  },
  async ({ deckId }) => jsonResult(await readDeckGraph(ctx(), deckId)),
);

server.registerTool(
  "list_cards",
  {
    title: "List Cards",
    description: "List cards in a deck.",
    inputSchema: z.object({
      deckId: idSchema.describe("Deck ID to inspect."),
    }),
  },
  async ({ deckId }) => jsonResult({ cards: await listNotes(ctx(), deckId) }),
);

server.registerTool(
  "get_card",
  {
    title: "Get Card",
    description: "Read one card by ID.",
    inputSchema: z.object({
      id: idSchema.describe("Card ID."),
    }),
  },
  async ({ id }) => jsonResult({ card: await getNote(ctx(), id) }),
);

async function main() {
  await initDb(profileId);
  await runMigrations(profileId);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  console.error(message);
  closeDb();
  process.exit(1);
});

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});
