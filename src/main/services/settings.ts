import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Settings } from "../db/schema";

/** Read the singleton settings row, seeding defaults on first access. */
export async function getSettings(): Promise<Settings> {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .get();
  if (existing) return existing;
  await db.insert(schema.settings).values({ id: 1 }).run();
  const seeded = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .get();
  return seeded!;
}

export type SettingsUpdate = Partial<
  Pick<
    Settings,
    | "requestRetention"
    | "maximumInterval"
    | "enableFuzz"
    | "enableShortTerm"
    | "learningSteps"
    | "relearningSteps"
    | "weights"
  >
>;

export async function updateSettings(patch: SettingsUpdate): Promise<Settings> {
  const db = getDb();
  await getSettings(); // ensure row exists
  await db
    .update(schema.settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.settings.id, 1))
    .run();
  return getSettings();
}
