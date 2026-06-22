import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatDays,
  formatRetentionPercent,
  formatStepsString,
  isValidMaximumInterval,
  isValidNewCardsPerDay,
  isValidRetention,
  isValidStabilityFloor,
  isValidStepDuration,
  NEW_CARDS_PER_DAY_MAX,
  parseBoundedInt,
  parseDays,
  parseRetentionPercent,
  parseStepsString,
  type StepDuration,
} from "@/lib/scheduling-settings";
import { useEffect, useState } from "react";

const invalidInputClass =
  "border-again focus-visible:border-again focus-visible:ring-again/30";

function UnitLabel({ children }: { children: string }) {
  return (
    <span className="shrink-0 text-[0.8125rem] text-muted">{children}</span>
  );
}

type RetentionInputProps = {
  value: number;
  onChange: (value: number) => void;
};

export function RetentionInput({ value, onChange }: RetentionInputProps) {
  const [draft, setDraft] = useState(formatRetentionPercent(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(formatRetentionPercent(value));
    setInvalid(false);
  }, [value]);

  const handleBlur = () => {
    const parsed = parseRetentionPercent(draft);
    if (parsed !== null && isValidRetention(parsed)) {
      setInvalid(false);
      setDraft(formatRetentionPercent(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(formatRetentionPercent(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleBlur}
        aria-invalid={invalid}
        className={cn(
          "w-16 text-right tabular-nums",
          invalid && invalidInputClass,
        )}
      />
      <UnitLabel>%</UnitLabel>
    </div>
  );
}

type MaximumIntervalInputProps = {
  value: number;
  onChange: (value: number) => void;
};

export function MaximumIntervalInput({
  value,
  onChange,
}: MaximumIntervalInputProps) {
  const [draft, setDraft] = useState(formatDays(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(formatDays(value));
    setInvalid(false);
  }, [value]);

  const handleBlur = () => {
    const parsed = parseDays(draft);
    if (parsed !== null && isValidMaximumInterval(parsed)) {
      setInvalid(false);
      setDraft(formatDays(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(formatDays(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d,]/g, ""));
        }}
        onBlur={handleBlur}
        aria-invalid={invalid}
        className={cn(
          "w-24 text-right tabular-nums",
          invalid && invalidInputClass,
        )}
      />
      <UnitLabel>days</UnitLabel>
    </div>
  );
}

type DurationStepFieldsProps = {
  step: StepDuration;
  onChange: (step: StepDuration) => void;
};

function DurationStepFields({ step, onChange }: DurationStepFieldsProps) {
  const [minutesDraft, setMinutesDraft] = useState(String(step.minutes));
  const [secondsDraft, setSecondsDraft] = useState(String(step.seconds));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setMinutesDraft(String(step.minutes));
    setSecondsDraft(String(step.seconds));
    setInvalid(false);
  }, [step.minutes, step.seconds]);

  const commit = (minutes: number, seconds: number) => {
    const next = { minutes, seconds };
    if (!isValidStepDuration(next)) {
      setInvalid(true);
      setMinutesDraft(String(step.minutes));
      setSecondsDraft(String(step.seconds));
      return;
    }
    setInvalid(false);
    onChange(next);
  };

  const handleMinutesBlur = () => {
    const minutes = parseBoundedInt(minutesDraft, 9999);
    const seconds = parseBoundedInt(secondsDraft, 59) ?? step.seconds;
    if (minutes === null) {
      setInvalid(true);
      setMinutesDraft(String(step.minutes));
      return;
    }
    commit(minutes, seconds);
  };

  const handleSecondsBlur = () => {
    const seconds = parseBoundedInt(secondsDraft, 59);
    const minutes = parseBoundedInt(minutesDraft, 9999) ?? step.minutes;
    if (seconds === null) {
      setInvalid(true);
      setSecondsDraft(String(step.seconds));
      return;
    }
    commit(minutes, seconds);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        inputMode="numeric"
        value={minutesDraft}
        onChange={(event) => {
          setInvalid(false);
          setMinutesDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleMinutesBlur}
        aria-label="Minutes"
        aria-invalid={invalid}
        className={cn(
          "w-14 text-right tabular-nums",
          invalid && invalidInputClass,
        )}
      />
      <UnitLabel>min</UnitLabel>
      <Input
        inputMode="numeric"
        value={secondsDraft}
        onChange={(event) => {
          setInvalid(false);
          setSecondsDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleSecondsBlur}
        aria-label="Seconds"
        aria-invalid={invalid}
        className={cn(
          "w-14 text-right tabular-nums",
          invalid && invalidInputClass,
        )}
      />
      <UnitLabel>sec</UnitLabel>
    </div>
  );
}

type StepsInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function StepsInput({ value, onChange }: StepsInputProps) {
  const step = parseStepsString(value)?.[0] ?? { minutes: 1, seconds: 0 };

  const handleChange = (next: StepDuration) => {
    if (!isValidStepDuration(next)) return;
    const formatted = formatStepsString([next]);
    if (formatted) onChange(formatted);
  };

  return <DurationStepFields step={step} onChange={handleChange} />;
}

type StabilityFloorInputProps = {
  value: number;
  onChange: (value: number) => void;
};

export function StabilityFloorInput({
  value,
  onChange,
}: StabilityFloorInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);

  const handleBlur = () => {
    const parsed = Number(draft);
    if (isValidStabilityFloor(parsed)) {
      setInvalid(false);
      setDraft(String(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(String(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="decimal"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d.]/g, ""));
        }}
        onBlur={handleBlur}
        aria-invalid={invalid}
        className={cn(
          "w-16 text-right tabular-nums",
          invalid && invalidInputClass,
        )}
      />
      <UnitLabel>days</UnitLabel>
    </div>
  );
}

type NewCardsPerDayInputProps = {
  value: number;
  onChange: (value: number) => void;
};

export function NewCardsPerDayInput({
  value,
  onChange,
}: NewCardsPerDayInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);

  const handleBlur = () => {
    const parsed = parseBoundedInt(draft, NEW_CARDS_PER_DAY_MAX);
    if (parsed !== null && isValidNewCardsPerDay(parsed)) {
      setInvalid(false);
      setDraft(String(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(String(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleBlur}
        aria-invalid={invalid}
        className={cn(
          "w-16 text-right tabular-nums",
          invalid && invalidInputClass,
        )}
      />
      <UnitLabel>review units</UnitLabel>
    </div>
  );
}
