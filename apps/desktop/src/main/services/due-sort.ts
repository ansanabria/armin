/** Lower values sort closer to the front of a due-soon queue. */
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
