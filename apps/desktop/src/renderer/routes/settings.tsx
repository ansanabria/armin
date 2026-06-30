import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RotateCcw } from "lucide-react";
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { McpSettings } from "@/components/mcp-settings";
import { KeybindingSettings } from "@/components/keybinding-settings";
import { useToast } from "@/components/ui/toast";
import { settingsKeys } from "@/lib/armin-query";
import {
  fieldDiffersFromPreset,
  PRESET_OPTIONS,
  PRESET_VALUES,
  presetHasOverrides,
  presetLabel,
  type PresetValues,
  type SchedulingPreset,
} from "../../shared/scheduling-presets";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/theme-provider";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Settings } from "@/types/window";

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
> & { schedulingPreset: SchedulingPreset };

type NamedSchedulingPreset = Exclude<SchedulingPreset, "custom">;

const NAMED_PRESET_OPTIONS = PRESET_OPTIONS.filter(
  (option): option is { value: NamedSchedulingPreset; label: string } =>
    option.value !== "custom",
);

const initial: SettingsState = {
  ...PRESET_VALUES.balanced,
  weights: null,
  schedulingPreset: "balanced",
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
    schedulingPreset: settings.schedulingPreset as SchedulingPreset,
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
  const currentRef = useRef(initial);
  const settingsLoadedRef = useRef(false);
  const queuedSaveRef = useRef<SettingsState | null>(null);
  const savingRef = useRef(false);

  const settingsQuery = useQuery({
    queryKey: settingsKeys.current,
    queryFn: () => window.armin.settings.get(),
  });

  const updateSettings = useMutation({
    mutationFn: (patch: SettingsState) => window.armin.settings.update(patch),
    onError: () => toast({ tone: "error", title: "Couldn’t save settings" }),
  });

  const replaceSettingsState = (next: SettingsState) => {
    currentRef.current = next;
    setS(next);
  };

  const flushSaveQueue = () => {
    if (savingRef.current) return;

    const next = queuedSaveRef.current;
    if (!next) return;

    queuedSaveRef.current = null;
    savingRef.current = true;
    updateSettings.mutate(next, {
      onSettled: () => {
        savingRef.current = false;
        if (queuedSaveRef.current) {
          flushSaveQueue();
          return;
        }
        void queryClient.invalidateQueries({ queryKey: settingsKeys.current });
      },
    });
  };

  const saveAutomatically = (next: SettingsState) => {
    if (!settingsLoadedRef.current) return;
    queuedSaveRef.current = next;
    flushSaveQueue();
  };

  const applySettingsState = (
    updater: (current: SettingsState) => SettingsState,
  ) => {
    const current = currentRef.current;
    const next = updater(current);
    if (settingsEqual(next, current)) return;
    replaceSettingsState(next);
    saveAutomatically(next);
  };

  const set = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => applySettingsState((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!settingsQuery.data || savingRef.current || queuedSaveRef.current) {
      return;
    }
    const next = toSettingsState(settingsQuery.data);
    replaceSettingsState(next);
    settingsLoadedRef.current = true;
  }, [settingsQuery.data]);

  const preset = s.schedulingPreset;

  const selectPreset = (next: SchedulingPreset) => {
    if (next === "custom") {
      set("schedulingPreset", "custom");
      return;
    }
    applySettingsState((current) => ({
      ...current,
      ...PRESET_VALUES[next],
      schedulingPreset: next,
    }));
  };

  const resetToPreset = () => {
    if (preset === "custom") return;
    applySettingsState((current) => ({
      ...current,
      ...PRESET_VALUES[preset],
      schedulingPreset: preset,
    }));
  };

  const fillCustomFromPreset = (source: NamedSchedulingPreset) => {
    applySettingsState((current) => ({
      ...current,
      ...PRESET_VALUES[source],
      schedulingPreset: "custom",
    }));
  };

  // Per-field reset: only named presets that differ from their canonical value
  // expose a reset affordance. Spread onto a <Row> to show its reset button.
  const resetProps = (key: keyof PresetValues) => {
    if (preset === "custom" || !fieldDiffersFromPreset(preset, key, s[key])) {
      return {};
    }
    const presetValue = PRESET_VALUES[preset][key];
    return { onReset: () => set(key, presetValue) };
  };

  const hasPresetOverrides = presetHasOverrides(preset, s);

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

      <Tabs defaultValue="scheduling">
        <TabsList>
          <TabsTab value="scheduling">Scheduling</TabsTab>
          <TabsTab value="ai">AI</TabsTab>
          <TabsTab value="data">Data</TabsTab>
          <TabsTab value="appearance">Appearance</TabsTab>
        </TabsList>

        <TabsPanel value="scheduling" className="space-y-10">
        <Section
          title="Scheduling profile"
          description="Pick a profile for a tuned set of spaced-repetition settings, or use Custom and fill it from a preset."
          action={
            preset === "custom" ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted">
                  Fill fields from
                </p>
                <div className="grid gap-1.5">
                  {NAMED_PRESET_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => fillCustomFromPreset(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : undefined
          }
        >
          <Row
            label="Preset"
            hint="Balanced suits most learners. Aggressive reviews more often. Relaxed reviews less."
            last
          >
            <Select
              value={preset}
              items={PRESET_OPTIONS}
              onValueChange={(v) => selectPreset(v as SchedulingPreset)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {PRESET_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>
        </Section>

        <Section
          title="Scheduling"
          description="Tune how FSRS schedules reviews for the selected profile."
        >
          <Row
            label="Desired retention"
            hint="Target recall probability. Higher means more frequent reviews."
            {...resetProps("requestRetention")}
          >
            <RetentionInput
              value={s.requestRetention}
              onChange={(v) => set("requestRetention", v)}
            />
          </Row>
          <Row
            label="Maximum interval"
            hint="The longest gap between reviews, in days."
            {...resetProps("maximumInterval")}
          >
            <MaximumIntervalInput
              value={s.maximumInterval}
              onChange={(v) => set("maximumInterval", v)}
            />
          </Row>
          <Row
            label="Learning steps"
            hint="Short steps for brand-new review units."
            {...resetProps("learningSteps")}
          >
            <StepsInput
              value={s.learningSteps}
              onChange={(v) => set("learningSteps", v)}
            />
          </Row>
          <Row
            label="Relearning steps"
            hint="Steps after you forget a review unit."
            {...resetProps("relearningSteps")}
          >
            <StepsInput
              value={s.relearningSteps}
              onChange={(v) => set("relearningSteps", v)}
            />
          </Row>
          <Row
            label="Interval fuzz"
            hint="Scatter due dates slightly so reviews don't clump."
            {...resetProps("enableFuzz")}
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
            {...resetProps("enableShortTerm")}
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
            {...resetProps("prereqStabilityFloor")}
          >
            <StabilityFloorInput
              value={s.prereqStabilityFloor}
              onChange={(v) => set("prereqStabilityFloor", v)}
            />
          </Row>
          <Row
            label="New review units per day"
            hint="Maximum brand-new review units introduced from the Profile-wide Frontier each day."
            {...resetProps("newReviewUnitsPerDay")}
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
            {...resetProps("keepSiblingReviewUnitsTogether")}
          >
            <Switch
              checked={s.keepSiblingReviewUnitsTogether}
              onCheckedChange={(v) => set("keepSiblingReviewUnitsTogether", v)}
            />
          </Row>
        </Section>

        {preset !== "custom" && hasPresetOverrides && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={resetToPreset}>
              <RotateCcw className="h-4 w-4" />
              Reset to {presetLabel(preset)} default settings
            </Button>
          </div>
        )}
        </TabsPanel>

        <TabsPanel value="ai" className="space-y-10">
        <Section
          title="Keyboard shortcuts"
          description="Rebind app-wide shortcuts for navigation, review, and cram. Only the ones you change are saved per profile."
        >
          <KeybindingSettings />
        </Section>

        <Section
          title="AI flashcard creation"
          description="Connect a coding agent to Armin's local MCP server so it can generate flashcards."
        >
          <McpSettings />
        </Section>
        </TabsPanel>

        <TabsPanel value="data" className="space-y-10">
        <Section
          title="Export & backup"
          description="Take your data out of the app."
        >
          <ExportRow />
        </Section>
        </TabsPanel>

        <TabsPanel value="appearance" className="space-y-10">
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
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function ExportRow() {
  const toast = useToast();

  const exportData = useMutation({
    mutationFn: () => window.armin.data.export(),
    onSuccess: (result) => {
      if (result.canceled) return;
      toast({
        tone: "success",
        title: "Library exported & backed up",
        description: `${result.deckCount} deck${
          result.deckCount === 1 ? "" : "s"
        }, ${result.flashcardCount} flashcard${
          result.flashcardCount === 1 ? "" : "s"
        } saved.`,
      });
    },
    onError: () =>
      toast({ tone: "error", title: "Couldn’t export your library" }),
  });

  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <p className="text-[0.8125rem] leading-snug text-muted">
        Download your whole library as a single zip — readable Markdown (one
        file per deck) plus a complete backup you can restore later from the
        profile picker.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={exportData.isPending}
        onClick={() => exportData.mutate()}
      >
        <Download className="h-4 w-4" />
        {exportData.isPending ? "Exporting…" : "Export"}
      </Button>
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
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
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="self-start border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  last,
  onReset,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  last?: boolean;
  onReset?: () => void;
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
      <div className="flex shrink-0 items-center justify-end gap-1.5 pt-0.5">
        {onReset && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Reset ${label} to preset default`}
            title="Reset to preset default"
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
