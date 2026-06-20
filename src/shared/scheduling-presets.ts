/**
 * Scheduling presets ("settings profiles"): named bundles of every
 * user-tunable spaced-repetition setting. Selecting a preset fills all the
 * preset-controlled fields at once. "custom" is a free-form selection with no
 * canonical values. FSRS `weights` are intentionally not part of a preset —
 * they come from optimization, not from a chosen study style.
 */

export type SchedulingPreset = "balanced" | "aggressive" | "relaxed" | "custom";

/** The settings fields a preset controls (everything except FSRS weights). */
export type PresetValues = {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string;
  relearningSteps: string;
  prereqStabilityFloor: number;
  newReviewUnitsPerDay: number;
  keepSiblingReviewUnitsTogether: boolean;
};

/** Field keys controlled by a preset, used to drive per-field reset logic. */
export const PRESET_FIELDS = [
  "requestRetention",
  "maximumInterval",
  "enableFuzz",
  "enableShortTerm",
  "learningSteps",
  "relearningSteps",
  "prereqStabilityFloor",
  "newReviewUnitsPerDay",
  "keepSiblingReviewUnitsTogether",
] as const satisfies readonly (keyof PresetValues)[];

/**
 * Balanced is the optimized default and mirrors the schema column defaults.
 * Aggressive and relaxed adjust only the dials that change study intensity:
 * desired retention (review frequency), the prerequisite stability floor (how
 * solid a prereq must be before it unlocks dependents), and how many new
 * review units enter per day.
 */
export const PRESET_VALUES: Record<
  Exclude<SchedulingPreset, "custom">,
  PresetValues
> = {
  balanced: {
    requestRetention: 0.9,
    maximumInterval: 36500,
    enableFuzz: true,
    enableShortTerm: true,
    learningSteps: "1m,10m",
    relearningSteps: "10m",
    prereqStabilityFloor: 2,
    newReviewUnitsPerDay: 10,
    keepSiblingReviewUnitsTogether: true,
  },
  aggressive: {
    requestRetention: 0.95,
    maximumInterval: 36500,
    enableFuzz: true,
    enableShortTerm: true,
    learningSteps: "1m,10m",
    relearningSteps: "10m",
    prereqStabilityFloor: 4,
    newReviewUnitsPerDay: 20,
    keepSiblingReviewUnitsTogether: true,
  },
  relaxed: {
    requestRetention: 0.85,
    maximumInterval: 36500,
    enableFuzz: true,
    enableShortTerm: true,
    learningSteps: "1m,10m",
    relearningSteps: "10m",
    prereqStabilityFloor: 1,
    newReviewUnitsPerDay: 5,
    keepSiblingReviewUnitsTogether: true,
  },
};

export const PRESET_OPTIONS: { value: SchedulingPreset; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" },
  { value: "relaxed", label: "Relaxed" },
  { value: "custom", label: "Custom" },
];

export const SCHEDULING_PRESET_VALUES = PRESET_OPTIONS.map(
  (option) => option.value,
) as [SchedulingPreset, ...SchedulingPreset[]];

export function presetLabel(preset: SchedulingPreset): string {
  return PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? "";
}

/** True when `preset` is a named preset and `value` differs from its canonical value. */
export function fieldDiffersFromPreset<K extends keyof PresetValues>(
  preset: SchedulingPreset,
  key: K,
  value: PresetValues[K],
): boolean {
  if (preset === "custom") return false;
  return PRESET_VALUES[preset][key] !== value;
}

/** True when any preset-controlled field differs from the active named preset. */
export function presetHasOverrides(
  preset: SchedulingPreset,
  values: PresetValues,
): boolean {
  if (preset === "custom") return false;
  return PRESET_FIELDS.some((key) =>
    fieldDiffersFromPreset(preset, key, values[key]),
  );
}
