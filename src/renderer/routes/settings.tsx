import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MaximumIntervalInput,
  NewCardsPerDayInput,
  RetentionInput,
  StabilityFloorInput,
  StepsInput,
} from "@/components/scheduling-inputs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { McpSettings } from "@/components/mcp-settings";
import { useToast } from "@/components/ui/toast";
import { settingsKeys } from "@/lib/armin-query";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/theme-provider";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Settings } from "@/types/window";

const BAR_EXIT_MS = 320;

type SettingsState = Pick<
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

const initial: SettingsState = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: "1m,10m",
  relearningSteps: "10m",
  weights: null,
  prereqStabilityFloor: 2,
  newReviewUnitsPerDay: 10,
  keepSiblingReviewUnitsTogether: true,
};

function toSettingsState(settings: Settings): SettingsState {
  return {
    requestRetention: settings.requestRetention,
    maximumInterval: settings.maximumInterval,
    enableFuzz: settings.enableFuzz,
    enableShortTerm: settings.enableShortTerm,
    learningSteps: settings.learningSteps,
    relearningSteps: settings.relearningSteps,
    weights: settings.weights,
    prereqStabilityFloor: settings.prereqStabilityFloor,
    newReviewUnitsPerDay: settings.newReviewUnitsPerDay,
    keepSiblingReviewUnitsTogether: settings.keepSiblingReviewUnitsTogether,
  };
}

function settingsEqual(a: SettingsState, b: SettingsState): boolean {
  return (Object.keys(a) as (keyof SettingsState)[]).every(
    (key) => a[key] === b[key],
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { preference: themePreference, setPreference: setThemePreference } =
    useTheme();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const settingsQuery = useQuery({
    queryKey: settingsKeys.current,
    queryFn: () => window.armin.settings.get(),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const next = toSettingsState(settingsQuery.data);
    setS(next);
    setSaved(next);
  }, [settingsQuery.data]);

  const isDirty = useMemo(() => !settingsEqual(s, saved), [s, saved]);

  const updateSettings = useMutation({
    mutationFn: (patch: SettingsState) => window.armin.settings.update(patch),
    onSuccess: (settings) => {
      const next = toSettingsState(settings);
      setS(next);
      setSaved(next);
      void queryClient.invalidateQueries({ queryKey: settingsKeys.current });
      toast({ tone: "success", title: "Settings saved" });
    },
    onError: () => toast({ tone: "error", title: "Couldn’t save settings" }),
  });

  const save = () => updateSettings.mutate(s);

  return (
    <div className="pb-24">
      <header className="mb-8">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
          Settings
        </h1>
      </header>

      {settingsQuery.isError && (
        <div className="mb-8 flex items-center justify-between gap-4 border border-border bg-surface px-4 py-3">
          <p className="text-sm text-muted">Couldn&apos;t load settings.</p>
          <Button
            variant="outline"
            onClick={() => void settingsQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      <div className="space-y-10">
        <Section
          title="Scheduling"
          description="How FSRS spaces your reviews. Defaults work well; tune only if you know why."
        >
          <Row
            label="Desired retention"
            hint="Target recall probability. Higher means more frequent reviews."
          >
            <RetentionInput
              value={s.requestRetention}
              onChange={(v) => set("requestRetention", v)}
            />
          </Row>
          <Row
            label="Maximum interval"
            hint="The longest gap between reviews, in days."
          >
            <MaximumIntervalInput
              value={s.maximumInterval}
              onChange={(v) => set("maximumInterval", v)}
            />
          </Row>
          <Row label="Learning steps" hint="Short steps for brand-new review units.">
            <StepsInput
              value={s.learningSteps}
              onChange={(v) => set("learningSteps", v)}
            />
          </Row>
          <Row label="Relearning steps" hint="Steps after you forget a review unit.">
            <StepsInput
              value={s.relearningSteps}
              onChange={(v) => set("relearningSteps", v)}
            />
          </Row>
          <Row
            label="Interval fuzz"
            hint="Scatter due dates slightly so reviews don't clump."
          >
            <Switch
              checked={s.enableFuzz}
              onCheckedChange={(v) => set("enableFuzz", v)}
            />
          </Row>
          <Row
            label="Short-term scheduling"
            hint="Use same-day learning steps for new and lapsed review units."
            last
          >
            <Switch
              checked={s.enableShortTerm}
              onCheckedChange={(v) => set("enableShortTerm", v)}
            />
          </Row>
        </Section>

        <Section
          title="Learning path"
          description="How prerequisite flashcards unlock and how many new review units enter each day."
        >
          <Row
            label="Prerequisite stability"
            hint="A prereq must reach this FSRS stability in Review before dependents unlock."
          >
            <StabilityFloorInput
              value={s.prereqStabilityFloor}
              onChange={(v) => set("prereqStabilityFloor", v)}
            />
          </Row>
          <Row
            label="New review units per day"
            hint="Maximum brand-new review units introduced from the unlock frontier each day."
          >
            <NewCardsPerDayInput
              value={s.newReviewUnitsPerDay}
              onChange={(v) => set("newReviewUnitsPerDay", v)}
            />
          </Row>
          <Row
            label="Keep siblings together"
            hint="Introduce all eligible directions or clozes for a flashcard in the same session."
            last
          >
            <Switch
              checked={s.keepSiblingReviewUnitsTogether}
              onCheckedChange={(v) => set("keepSiblingReviewUnitsTogether", v)}
            />
          </Row>
        </Section>

        <Section
          title="AI flashcard creation"
          description="Connect a coding agent to Armin's local MCP server so it can generate flashcards."
        >
          <McpSettings />
        </Section>

        <Section
          title="Appearance"
          description="How Armin looks on your machine."
        >
          <Row
            label="Theme"
            hint="Flexoki light, Flexoki dark, or match your system setting."
            last
          >
            <Select
              value={themePreference}
              items={THEME_OPTIONS}
              onValueChange={(v) => setThemePreference(v as ThemePreference)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {THEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>
        </Section>
      </div>

      <UnsavedChangesBar
        open={isDirty}
        saving={updateSettings.isPending}
        onSave={save}
      />
    </div>
  );
}

function UnsavedChangesBar({
  open,
  saving,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setClosing(false);
    } else if (present) {
      setClosing(true);
    }
  }, [open, present]);

  useEffect(() => {
    if (!closing) return;

    let finished = false;
    const finishClose = () => {
      if (finished) return;
      finished = true;
      setPresent(false);
      setClosing(false);
    };

    const bar = barRef.current;
    const onEnd = (event: AnimationEvent) => {
      if (event.target !== bar) return;
      finishClose();
    };

    bar?.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(finishClose, BAR_EXIT_MS + 50);

    return () => {
      bar?.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [closing]);

  if (!present) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-4 z-50 flex justify-center px-4",
        closing ? "animate-fade-out" : "animate-fade-in",
      )}
      role="status"
      aria-live="polite"
    >
      <div
        ref={barRef}
        className={cn(
          "flex flex-wrap items-center justify-center gap-3 border border-border bg-surface px-4 py-3 shadow-overlay sm:gap-4",
          closing ? "animate-bar-out" : "animate-bar-in",
        )}
      >
        <p className="text-sm text-ink">You have unsaved changes.</p>
        <Button size="sm" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 md:grid-cols-[240px_1fr]">
      <div className="pt-0.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            {description}
          </p>
        )}
      </div>
      <div className="border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  last,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 px-4 py-3.5",
        !last && "border-b border-border",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[0.8125rem] text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 justify-end pt-0.5">{children}</div>
    </div>
  );
}
