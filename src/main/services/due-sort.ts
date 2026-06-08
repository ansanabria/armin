import { sql, type SQL } from "drizzle-orm";
import { schema } from "../db";

const { cards } = schema;

/** Mirrors renderer `dueLabelPriority` using raw scheduling fields. */
export function dueSortPriority(
  row: { locked: boolean; state: number; due: Date },
  now: Date,
): number {
  if (row.locked) return 95;
  if (row.state === 0) return 90;
  if (row.due <= now) return 0;

  const ms = row.due.getTime() - now.getTime();
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return 1 + mins / 1000;

  const days = Math.ceil(ms / 86_400_000);
  if (days < 30) return 10 + days;

  const months = Math.ceil(days / 30);
  if (months < 12) return 50 + months;

  return 80;
}

/** SQL expression matching `dueSortPriority` for paginated ORDER BY. */
export function sqlDueSortPriority(nowMs: number): SQL {
  const dueMs = sql`cast(${cards.due} as integer)`;
  const delta = sql`${dueMs} - ${nowMs}`;
  const mins = sql`((${delta}) + 59999) / 60000`;
  const days = sql`((${delta}) + 86399999) / 86400000`;

  return sql`case
    when ${cards.locked} then 95
    when ${cards.state} = 0 then 90
    when ${dueMs} <= ${nowMs} then 0
    when ${mins} < 60 then 1.0 + (${mins} * 1.0) / 1000.0
    when ${days} < 30 then 10.0 + (${days} * 1.0)
    when ((${days} + 29) / 30) < 12 then 50.0 + ((${days} + 29) / 30) * 1.0
    else 80
  end`;
}
