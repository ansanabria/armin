import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, X } from "lucide-react";
import {
  MaximumIntervalInput,
  RetentionInput,
  StabilityFloorInput,
  StepsInput,
} from "@/components/scheduling-inputs";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { settingsKeys } from "@/lib/armin-query";
import { cn } from "@/lib/utils";
import type {
  DeckSettingsOverrides,
  SchedulingSettings,
} from "../../main/services/settings";

type SchedulingKey = keyof SchedulingSettings;

// Keys this dialog exposes, in display order. `weights` is intentionally
// omitted — FSRS weights come from optimization, not from a study-style choice.
const OVERRIDE_KEYS = [
  "requestRetention",
  "maximumInterval",
  "learningSteps",
  "relearningSteps",
  "enableFuzz",
  "enableShortTerm",
  "prereqStabilityFloor",
  "keepSiblingReviewUnitsTogether",
] as const satisfies readonly SchedulingKey[];

export function DeckSettingsDialog({
  deckId,
  deckName,
  open,
  onClose,
}: {
  deckId: string;
  deckName: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [overrides, setOverrides] = useState<DeckSettingsOverrides | null>(null);

  const query = useQuery({
    queryKey: settingsKeys.deck(deckId),
    queryFn: () => window.armin.settings.getDeck(deckId),
    enabled: open,
  });

  useEffect(() => {
    if (query.data) setOverrides(query.data.overrides);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (patch: DeckSettingsOverrides) =>
      window.armin.settings.updateDeck(deckId, patch),
    onSuccess: (saved) => {
      setOverrides(saved.overrides);
      void queryClient.invalidateQueries({ queryKey: settingsKeys.deck(deckId) });
      toast({ tone: "success", title: "Deck settings saved" });
      onClose();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t save deck settings" }),
  });

  const data = query.data;
  const localOverrides = overrides ?? data?.overrides ?? null;
  const effective =
    data && localOverrides
      ? resolveEffective(data.global, localOverrides)
      : null;

  // Editing a field stores it as an override only when it diverges from the
  // global value; setting it back to the global value clears the override
  // (and, with it, the reset affordance) — exactly as if it were never touched.
  const setField = <K extends SchedulingKey>(
    key: K,
    value: SchedulingSettings[K],
  ) => {
    if (!localOverrides || !data) return;
    const matchesGlobal = value === data.global[key];
    setOverrides({ ...localOverrides, [key]: matchesGlobal ? null : value });
  };

  const clearField = (key: SchedulingKey) => {
    if (!localOverrides) return;
    setOverrides({ ...localOverrides, [key]: null });
  };

  const resetAll = () => {
    if (!localOverrides) return;
    const cleared = { ...localOverrides };
    for (const key of OVERRIDE_KEYS) cleared[key] = null;
    setOverrides(cleared);
  };

  const overrideCount = localOverrides
    ? OVERRIDE_KEYS.filter((key) => localOverrides[key] !== null).length
    : 0;

  const save = () => {
    if (localOverrides) mutation.mutate(localOverrides);
  };

  const ready = !query.isLoading && data && localOverrides && effective;

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl p-0">
      <div className="flex max-h-[min(80vh,46rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">Deck settings</h2>
            <p className="mt-0.5 truncate text-sm text-muted">{deckName}</p>
            <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
              {overrideCount === 0
                ? "Inheriting every setting from your global defaults."
                : `${overrideCount} setting${overrideCount === 1 ? "" : "s"} overriding your global defaults.`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {!ready ? (
          <div className="px-6 py-10 text-sm text-muted">Loading settings…</div>
        ) : (
          <div className="armin-scrollbar flex-1 space-y-8 overflow-y-auto px-6 py-6">
            <Section
              title="Scheduling"
              description="How FSRS schedules reviews for cards in this deck."
            >
              <OverrideRow
                label="Desired retention"
                hint="Target recall probability. Higher means more frequent reviews."
                overridden={localOverrides.requestRetention !== null}
                onRevert={() => clearField("requestRetention")}
              >
                <RetentionInput
                  value={effective.requestRetention}
                  onChange={(value) => setField("requestRetention", value)}
                />
              </OverrideRow>
              <OverrideRow
                label="Maximum interval"
                hint="The longest gap between reviews, in days."
                overridden={localOverrides.maximumInterval !== null}
                onRevert={() => clearField("maximumInterval")}
              >
                <MaximumIntervalInput
                  value={effective.maximumInterval}
                  onChange={(value) => setField("maximumInterval", value)}
                />
              </OverrideRow>
              <OverrideRow
                label="Learning steps"
                hint="Short steps for brand-new review units."
                overridden={localOverrides.learningSteps !== null}
                onRevert={() => clearField("learningSteps")}
              >
                <StepsInput
                  value={effective.learningSteps}
                  onChange={(value) => setField("learningSteps", value)}
                />
              </OverrideRow>
              <OverrideRow
                label="Relearning steps"
                hint="Steps after you forget a review unit."
                overridden={localOverrides.relearningSteps !== null}
                onRevert={() => clearField("relearningSteps")}
              >
                <StepsInput
                  value={effective.relearningSteps}
                  onChange={(value) => setField("relearningSteps", value)}
                />
              </OverrideRow>
              <OverrideRow
                label="Interval fuzz"
                hint="Scatter due dates slightly so reviews don't clump."
                overridden={localOverrides.enableFuzz !== null}
                onRevert={() => clearField("enableFuzz")}
              >
                <Switch
                  checked={effective.enableFuzz}
                  onCheckedChange={(value) => setField("enableFuzz", value)}
                />
              </OverrideRow>
              <OverrideRow
                label="Short-term scheduling"
                hint="Use same-day learning steps for new and lapsed review units."
                overridden={localOverrides.enableShortTerm !== null}
                onRevert={() => clearField("enableShortTerm")}
                last
              >
                <Switch
                  checked={effective.enableShortTerm}
                  onCheckedChange={(value) =>
                    setField("enableShortTerm", value)
                  }
                />
              </OverrideRow>
            </Section>

            <Section
              title="Learning path"
              description="How prerequisites unlock and how much new material this deck introduces each day."
            >
              <OverrideRow
                label="Prerequisite stability"
                hint="A prereq must reach this FSRS stability in Review before dependents unlock."
                overridden={localOverrides.prereqStabilityFloor !== null}
                onRevert={() => clearField("prereqStabilityFloor")}
              >
                <StabilityFloorInput
                  value={effective.prereqStabilityFloor}
                  onChange={(value) =>
                    setField("prereqStabilityFloor", value)
                  }
                />
              </OverrideRow>
              <OverrideRow
                label="Keep siblings together"
                hint="Introduce all eligible directions or clozes for a flashcard in the same session."
                overridden={
                  localOverrides.keepSiblingReviewUnitsTogether !== null
                }
                onRevert={() => clearField("keepSiblingReviewUnitsTogether")}
                last
              >
                <Switch
                  checked={effective.keepSiblingReviewUnitsTogether}
                  onCheckedChange={(value) =>
                    setField("keepSiblingReviewUnitsTogether", value)
                  }
                />
              </OverrideRow>
            </Section>
          </div>
        )}

        <footer className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            disabled={!ready || overrideCount === 0}
          >
            <RotateCcw className="h-4 w-4" />
            Reset all to inherited
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!ready || mutation.isPending}>
              Save
            </Button>
          </div>
        </footer>
      </div>
    </Dialog>
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
    <section>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
          {description}
        </p>
      )}
      <div className="mt-3 border border-border bg-surface">{children}</div>
    </section>
  );
}

function OverrideRow({
  label,
  hint,
  overridden,
  onRevert,
  last,
  children,
}: {
  label: string;
  hint: string;
  overridden: boolean;
  onRevert: () => void;
  last?: boolean;
  children: ReactNode;
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
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{hint}</p>
      </div>
      <div className="flex min-h-9 shrink-0 items-center justify-end gap-1.5">
        {overridden && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Reset ${label} to inherited`}
            title="Reset to inherited"
            onClick={onRevert}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

function resolveEffective(
  global: SchedulingSettings,
  overrides: DeckSettingsOverrides,
): SchedulingSettings {
  return {
    requestRetention: overrides.requestRetention ?? global.requestRetention,
    maximumInterval: overrides.maximumInterval ?? global.maximumInterval,
    enableFuzz: overrides.enableFuzz ?? global.enableFuzz,
    enableShortTerm: overrides.enableShortTerm ?? global.enableShortTerm,
    learningSteps: overrides.learningSteps ?? global.learningSteps,
    relearningSteps: overrides.relearningSteps ?? global.relearningSteps,
    weights: overrides.weights ?? global.weights,
    prereqStabilityFloor:
      overrides.prereqStabilityFloor ?? global.prereqStabilityFloor,
    newReviewUnitsPerDay: global.newReviewUnitsPerDay,
    keepSiblingReviewUnitsTogether:
      overrides.keepSiblingReviewUnitsTogether ??
      global.keepSiblingReviewUnitsTogether,
  };
}
