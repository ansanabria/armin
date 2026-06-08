import { describe, expect, it } from "vitest";
import { dueSortPriority } from "./due-sort";

describe("dueSortPriority", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");

  it("orders locked after due cards and before distant reviews", () => {
    const dueNow = dueSortPriority(
      { locked: false, state: 2, due: new Date("2026-06-08T11:00:00.000Z") },
      now,
    );
    const locked = dueSortPriority(
      { locked: true, state: 0, due: now },
      now,
    );
    const brandNew = dueSortPriority(
      { locked: false, state: 0, due: now },
      now,
    );
    const later = dueSortPriority(
      { locked: false, state: 2, due: new Date("2026-07-08T12:00:00.000Z") },
      now,
    );

    expect(dueNow).toBeLessThan(later);
    expect(later).toBeLessThan(brandNew);
    expect(brandNew).toBeLessThan(locked);
  });

  it("ranks nearer future due dates ahead of distant ones", () => {
    const inOneHour = dueSortPriority(
      { locked: false, state: 2, due: new Date("2026-06-08T13:00:00.000Z") },
      now,
    );
    const inTwoDays = dueSortPriority(
      { locked: false, state: 2, due: new Date("2026-06-10T12:00:00.000Z") },
      now,
    );

    expect(inOneHour).toBeLessThan(inTwoDays);
  });
});
