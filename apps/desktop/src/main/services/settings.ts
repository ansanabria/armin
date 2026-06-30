import { eq } from "drizzle-orm";
import { PRESET_VALUES } from "../../shared/scheduling-presets";
import { schema } from "../db";
import type { DeckSettings, Settings } from "../db/schema";
import type { ServiceContext } from "./context";
import {
  refreshAllLockedStates,
  refreshLockedForDeck,
} from "./prerequisite-state";

export type SchedulingSettings = Pick<
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
>;

export const SCHEDULING_SETTING_KEYS = [
  "requestRetention",
  "maximumInterval",
  "enableFuzz",
  "enableShortTerm",
  "learningSteps",
  "relearningSteps",
  "weights",
  "prereqStabilityFloor",
  "newReviewUnitsPerDay",
  "keepSiblingReviewUnitsTogether",
] as const satisfies readonly (keyof SchedulingSettings)[];

/** Read the singleton settings row, seeding defaults on first access. */
export async function getSettings(ctx: ServiceContext): Promise<Settings> {
  const db = ctx.db;
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .get();
  if (existing) return existing;
  db
    .insert(schema.settings)
    .values({
      id: 1,
      ...PRESET_VALUES.balanced,
      schedulingPreset: "balanced",
    })
    .run();
  const seeded = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .get();
  return seeded!;
}

export type SettingsUpdate = Partial<SchedulingSettings> &
  Partial<Pick<Settings, "schedulingPreset" | "keybindings">>;

type DeckSettingOverrideKey = Exclude<
  keyof SchedulingSettings,
  "newReviewUnitsPerDay"
>;

const DECK_SETTING_OVERRIDE_KEYS = SCHEDULING_SETTING_KEYS.filter(
  (key): key is DeckSettingOverrideKey => key !== "newReviewUnitsPerDay",
);

export type DeckSettingsOverrides = {
  [K in DeckSettingOverrideKey]: SchedulingSettings[K] | null;
};

export type DeckSettingsUpdate = Partial<DeckSettingsOverrides>;

function schedulingSettingsFrom(row: Settings): SchedulingSettings {
  return {
    requestRetention: row.requestRetention,
    maximumInterval: row.maximumInterval,
    enableFuzz: row.enableFuzz,
    enableShortTerm: row.enableShortTerm,
    learningSteps: row.learningSteps,
    relearningSteps: row.relearningSteps,
    weights: row.weights,
    prereqStabilityFloor: row.prereqStabilityFloor,
    newReviewUnitsPerDay: row.newReviewUnitsPerDay,
    keepSiblingReviewUnitsTogether: row.keepSiblingReviewUnitsTogether,
  };
}

function emptyOverrides(): DeckSettingsOverrides {
  return {
    requestRetention: null,
    maximumInterval: null,
    enableFuzz: null,
    enableShortTerm: null,
    learningSteps: null,
    relearningSteps: null,
    weights: null,
    prereqStabilityFloor: null,
    keepSiblingReviewUnitsTogether: null,
  };
}

function overridesFrom(row: DeckSettings | undefined): DeckSettingsOverrides {
  if (!row) return emptyOverrides();
  return {
    requestRetention: row.requestRetention,
    maximumInterval: row.maximumInterval,
    enableFuzz: row.enableFuzz,
    enableShortTerm: row.enableShortTerm,
    learningSteps: row.learningSteps,
    relearningSteps: row.relearningSteps,
    weights: row.weights,
    prereqStabilityFloor: row.prereqStabilityFloor,
    keepSiblingReviewUnitsTogether: row.keepSiblingReviewUnitsTogether,
  };
}

function resolveEffective(
  global: SchedulingSettings,
  overrides: DeckSettingsOverrides,
): SchedulingSettings {
  const effective = { ...global };
  for (const key of DECK_SETTING_OVERRIDE_KEYS) {
    const override = overrides[key];
    if (override !== null) {
      effective[key] = override as never;
    }
  }
  return effective;
}

export async function updateSettings(
  ctx: ServiceContext,
  patch: SettingsUpdate,
): Promise<Settings> {
  const db = ctx.db;
  await getSettings(ctx); // ensure row exists
  db
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

export async function getDeckSettings(ctx: ServiceContext, deckId: string) {
  const globalSettings = await getSettings(ctx);
  const row = ctx.db
    .select()
    .from(schema.deckSettings)
    .where(eq(schema.deckSettings.deckId, deckId))
    .get();
  const global = schedulingSettingsFrom(globalSettings);
  const overrides = overridesFrom(row);
  return {
    global,
    overrides,
    effective: resolveEffective(global, overrides),
  };
}

export async function getEffectiveSettingsForDeck(
  ctx: ServiceContext,
  deckId: string,
): Promise<SchedulingSettings> {
  return (await getDeckSettings(ctx, deckId)).effective;
}

export async function updateDeckSettings(
  ctx: ServiceContext,
  deckId: string,
  patch: DeckSettingsUpdate,
) {
  const now = new Date();
  const existing = ctx.db
    .select()
    .from(schema.deckSettings)
    .where(eq(schema.deckSettings.deckId, deckId))
    .get();

  if (existing) {
    ctx.db
      .update(schema.deckSettings)
      .set({ ...patch, updatedAt: now })
      .where(eq(schema.deckSettings.deckId, deckId))
      .run();
  } else {
    ctx.db
      .insert(schema.deckSettings)
      .values({ deckId, ...patch, updatedAt: now })
      .run();
  }

  if (patch.prereqStabilityFloor !== undefined) {
    await refreshLockedForDeck(ctx, deckId);
  }

  return getDeckSettings(ctx, deckId);
}
