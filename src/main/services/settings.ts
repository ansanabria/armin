import { eq } from "drizzle-orm";
import { schema } from "../db";
import type { Settings } from "../db/schema";
import type { ServiceContext } from "./context";
import { refreshAllLockedStates } from "./graph";

/** Read the singleton settings row, seeding defaults on first access. */
export async function getSettings(ctx: ServiceContext): Promise<Settings> {
  const db = ctx.db;
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
    | "prereqStabilityFloor"
    | "newReviewUnitsPerDay"
    | "keepSiblingReviewUnitsTogether"
  >
>;

export async function updateSettings(
  ctx: ServiceContext,
  patch: SettingsUpdate,
): Promise<Settings> {
  const db = ctx.db;
  await getSettings(ctx); // ensure row exists
  await db
    .update(schema.settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.settings.id, 1))
    .run();
  const saved = await getSettings(ctx);
  if (patch.prereqStabilityFloor !== undefined) {
    await refreshAllLockedStates(ctx);
  }
  return saved;
}
