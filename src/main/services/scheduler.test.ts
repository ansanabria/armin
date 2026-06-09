import { createEmptyCard, State as FsrsState } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  fromFsrsCard,
  isPendingSchedule,
  isPrereqSecured,
  newCardFields,
  pendingCardFields,
  PENDING_DUE,
  State,
  toFsrsCard,
  type FsrsFields,
} from "./scheduler";

describe("scheduler", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");

  it("newCardFields matches createEmptyCard from ts-fsrs", () => {
    const expected = fromFsrsCard(createEmptyCard(now));
    const actual = newCardFields(now);
    expect(actual.state).toBe(FsrsState.New);
    expect(actual.due).toEqual(expected.due);
    expect(actual.stability).toBe(expected.stability);
    expect(actual.difficulty).toBe(expected.difficulty);
    expect(actual.reps).toBe(0);
    expect(actual.lastReview).toBeNull();
  });

  it("pendingCardFields uses far-future due date", () => {
    const pending = pendingCardFields();
    expect(pending.due).toEqual(PENDING_DUE);
    expect(pending.state).toBe(State.New);
    expect(pending.reps).toBe(0);
    expect(pending.lastReview).toBeNull();
  });

  it("isPendingSchedule detects locked never-studied cards", () => {
    const pending = pendingCardFields();
    expect(isPendingSchedule(pending)).toBe(true);

    expect(
      isPendingSchedule({
        due: PENDING_DUE,
        reps: 1,
        lastReview: null,
      }),
    ).toBe(false);

    expect(
      isPendingSchedule({
        due: PENDING_DUE,
        reps: 0,
        lastReview: now,
      }),
    ).toBe(false);

    expect(
      isPendingSchedule({
        due: now,
        reps: 0,
        lastReview: null,
      }),
    ).toBe(false);
  });

  it("isPrereqSecured requires Review state and stability floor", () => {
    const floor = 2;
    expect(
      isPrereqSecured({ state: State.Learning, stability: 5 }, floor),
    ).toBe(false);
    expect(
      isPrereqSecured({ state: State.Review, stability: 1.5 }, floor),
    ).toBe(false);
    expect(isPrereqSecured({ state: State.Review, stability: 2 }, floor)).toBe(
      true,
    );
    expect(isPrereqSecured({ state: State.Review, stability: 3 }, floor)).toBe(
      true,
    );
  });

  it("round-trips FSRS fields through toFsrsCard and fromFsrsCard", () => {
    const fields: FsrsFields = {
      due: now,
      stability: 2.4,
      difficulty: 5.1,
      elapsedDays: 3,
      scheduledDays: 4,
      learningSteps: 1,
      reps: 2,
      lapses: 0,
      state: State.Review,
      lastReview: now,
    };

    const roundTripped = fromFsrsCard(toFsrsCard(fields));
    expect(roundTripped.due).toEqual(fields.due);
    expect(roundTripped.stability).toBeCloseTo(fields.stability);
    expect(roundTripped.difficulty).toBeCloseTo(fields.difficulty);
    expect(roundTripped.elapsedDays).toBeCloseTo(fields.elapsedDays);
    expect(roundTripped.scheduledDays).toBeCloseTo(fields.scheduledDays);
    expect(roundTripped.learningSteps).toBe(fields.learningSteps);
    expect(roundTripped.reps).toBe(fields.reps);
    expect(roundTripped.lapses).toBe(fields.lapses);
    expect(roundTripped.state).toBe(fields.state);
    expect(roundTripped.lastReview).toEqual(fields.lastReview);
  });

  it("round-trips null lastReview", () => {
    const fields = newCardFields(now);
    const roundTripped = fromFsrsCard(toFsrsCard(fields));
    expect(roundTripped.lastReview).toBeNull();
  });
});
