export type StepDuration = {
  minutes: number;
  seconds: number;
};

const STEP_TOKEN = /^(\d+)([mhd])$/i;

export const RETENTION_MIN = 0.7;
export const RETENTION_MAX = 0.99;
export const MAX_INTERVAL_MIN = 1;
export const MAX_INTERVAL_MAX = 36500;
export const STABILITY_FLOOR_MIN = 0.1;
export const STABILITY_FLOOR_MAX = 365;
export const NEW_CARDS_PER_DAY_MIN = 0;
export const NEW_CARDS_PER_DAY_MAX = 999;

export function formatRetentionPercent(value: number): string {
  return String(Math.round(value * 100));
}

export function parseRetentionPercent(input: string): number | null {
  const trimmed = input.trim().replace(/%$/, "");
  if (!/^\d+$/.test(trimmed)) return null;
  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) return null;
  return percent / 100;
}

export function isValidRetention(value: number): boolean {
  return value >= RETENTION_MIN && value <= RETENTION_MAX;
}

export function formatDays(value: number): string {
  return value.toLocaleString("en-US");
}

export function parseDays(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  if (!Number.isFinite(days)) return null;
  return days;
}

export function isValidMaximumInterval(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MAX_INTERVAL_MIN &&
    value <= MAX_INTERVAL_MAX
  );
}

export function parseStepsString(csv: string): StepDuration[] | null {
  const tokens = csv
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const steps: StepDuration[] = [];
  for (const token of tokens) {
    const parsed = parseStepToken(token);
    if (!parsed) return null;
    steps.push(parsed);
  }
  return steps;
}

function parseStepToken(token: string): StepDuration | null {
  const match = STEP_TOKEN.exec(token);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return null;

  switch (unit) {
    case "m":
      return { minutes: value, seconds: 0 };
    case "h":
      return { minutes: value * 60, seconds: 0 };
    case "d":
      return { minutes: value * 1440, seconds: 0 };
    default:
      return null;
  }
}

export function formatStepsString(steps: StepDuration[]): string | null {
  if (steps.length === 0) return null;
  const tokens: string[] = [];
  for (const step of steps) {
    const token = formatStepToken(step);
    if (!token) return null;
    tokens.push(token);
  }
  return tokens.join(", ");
}

export function isValidStepDuration(step: StepDuration): boolean {
  const totalSeconds = step.minutes * 60 + step.seconds;
  return (
    Number.isInteger(step.minutes) &&
    Number.isInteger(step.seconds) &&
    step.minutes >= 0 &&
    step.seconds >= 0 &&
    step.seconds < 60 &&
    totalSeconds > 0
  );
}

export function isValidSteps(steps: StepDuration[]): boolean {
  return steps.length > 0 && steps.every(isValidStepDuration);
}

function formatStepToken(step: StepDuration): string | null {
  if (!isValidStepDuration(step)) return null;

  const totalMinutes = Math.round((step.minutes * 60 + step.seconds) / 60);
  const minutes = Math.max(1, totalMinutes);

  if (minutes >= 1440 && minutes % 1440 === 0) {
    return `${minutes / 1440}d`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

export function isValidStabilityFloor(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= STABILITY_FLOOR_MIN &&
    value <= STABILITY_FLOOR_MAX
  );
}

export function isValidNewCardsPerDay(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= NEW_CARDS_PER_DAY_MIN &&
    value <= NEW_CARDS_PER_DAY_MAX
  );
}

export function parseBoundedInt(input: string, max: number): number | null {
  const trimmed = input.trim();
  if (!/^\d*$/.test(trimmed)) return null;
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > max) return null;
  return value;
}
