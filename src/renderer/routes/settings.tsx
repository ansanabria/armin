import {
  MaximumIntervalInput,
  RetentionInput,
  StepsInput,
} from "@/components/scheduling-inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { settings as initial } from "@/data/fixtures";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/theme-provider";
import { Copy, Download, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const BAR_EXIT_MS = 320;

type SettingsState = typeof initial;

function settingsEqual(a: SettingsState, b: SettingsState): boolean {
  return (Object.keys(a) as (keyof SettingsState)[]).every(
    (key) => a[key] === b[key],
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const { preference: themePreference, setPreference: setThemePreference } =
    useTheme();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const isDirty = useMemo(() => !settingsEqual(s, saved), [s, saved]);

  const save = () => {
    setSaved(s);
    toast({ tone: "success", title: "Settings saved" });
  };

  const mcpCommand = `claude mcp add armin -- armin-mcp --port ${s.mcpPort}`;

  return (
    <div className="pb-24">
      <header className="mb-8">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
          Settings
        </h1>
      </header>

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
          <Row label="Learning steps" hint="Short steps for brand-new cards.">
            <StepsInput
              value={s.learningSteps}
              onChange={(v) => set("learningSteps", v)}
            />
          </Row>
          <Row label="Relearning steps" hint="Steps after you forget a card.">
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
            hint="Use same-day learning steps for new and lapsed cards."
            last
          >
            <Switch
              checked={s.enableShortTerm}
              onCheckedChange={(v) => set("enableShortTerm", v)}
            />
          </Row>
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

        <Section
          title="AI card creation"
          description="Expose a local MCP server so your own agent can generate cards."
        >
          <Row
            label="Local MCP server"
            hint="Runs only while Armin is open. Nothing leaves your machine."
            last={!s.mcpEnabled}
          >
            <Switch
              checked={s.mcpEnabled}
              onCheckedChange={(v) => set("mcpEnabled", v)}
            />
          </Row>
          {s.mcpEnabled && (
            <>
              <Row
                label="Port"
                hint="Where the server listens locally."
                last={false}
              >
                <Input
                  type="number"
                  value={s.mcpPort}
                  onChange={(e) => set("mcpPort", Number(e.target.value))}
                  className="w-36 text-right tabular-nums"
                />
              </Row>
              <div className="border-t border-border px-4 py-3.5">
                <div className="flex items-center gap-2 border border-border bg-surface-sunken py-2 pl-3 pr-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink">
                    {mcpCommand}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy connect command"
                    onClick={() => {
                      navigator.clipboard?.writeText(mcpCommand);
                      toast({ tone: "success", title: "Copied to clipboard" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Section>

        <Section
          title="Your data"
          description="Everything lives in a local SQLite file. Back it up any time."
        >
          <div className="flex flex-wrap gap-2 px-4 py-3.5">
            <Button
              variant="outline"
              onClick={() => toast({ title: "Exporting deck file" })}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              variant="outline"
              onClick={() => toast({ title: "Choose a file to import" })}
            >
              <Upload className="h-4 w-4" /> Import
            </Button>
          </div>
        </Section>
      </div>

      <UnsavedChangesBar open={isDirty} onSave={save} />
    </div>
  );
}

function UnsavedChangesBar({
  open,
  onSave,
}: {
  open: boolean;
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
        <Button size="sm" onClick={onSave}>
          Save changes
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
      <div className="border border-border">{children}</div>
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
