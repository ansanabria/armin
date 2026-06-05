import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { settings as initial } from "@/data/fixtures";

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState(initial);
  const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const mcpCommand = `claude mcp add armin -- armin-mcp --port ${s.mcpPort}`;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol"
      >
        <ArrowLeft className="h-4 w-4" /> All decks
      </Link>
      <h1 className="mb-8 mt-4 text-2xl font-bold tracking-tight">Settings</h1>

      <div className="space-y-10">
        <Section
          title="Scheduling"
          description="How FSRS spaces your reviews. Defaults work well; tune only if you know why."
        >
          <Row
            label="Desired retention"
            hint="Target recall probability. Higher means more frequent reviews."
          >
            <Input
              type="number"
              min={0.7}
              max={0.99}
              step={0.01}
              value={s.requestRetention}
              onChange={(e) =>
                set("requestRetention", Number(e.target.value))
              }
              className="w-28 text-right tabular-nums"
            />
          </Row>
          <Row
            label="Maximum interval"
            hint="The longest gap between reviews, in days."
          >
            <Input
              type="number"
              value={s.maximumInterval}
              onChange={(e) => set("maximumInterval", Number(e.target.value))}
              className="w-36 text-right tabular-nums"
            />
          </Row>
          <Row label="Learning steps" hint="Short steps for brand-new cards.">
            <Input
              value={s.learningSteps}
              onChange={(e) => set("learningSteps", e.target.value)}
              className="w-36 font-mono text-[0.8125rem]"
            />
          </Row>
          <Row label="Relearning steps" hint="Steps after you forget a card.">
            <Input
              value={s.relearningSteps}
              onChange={(e) => set("relearningSteps", e.target.value)}
              className="w-36 font-mono text-[0.8125rem]"
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
          <Row label="Theme" hint="Light, or follow your system setting." last>
            <Select
              value={s.theme}
              onChange={(e) =>
                set("theme", e.target.value as typeof s.theme)
              }
              className="w-40"
            >
              <option value="light">Light</option>
              <option value="system">System</option>
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
          >
            <Switch
              checked={s.mcpEnabled}
              onCheckedChange={(v) => set("mcpEnabled", v)}
            />
          </Row>
          {s.mcpEnabled && (
            <div className="animate-fade-in space-y-3 pt-4">
              <Row label="Port" hint="Where the server listens locally." last>
                <Input
                  type="number"
                  value={s.mcpPort}
                  onChange={(e) => set("mcpPort", Number(e.target.value))}
                  className="w-28 text-right tabular-nums"
                />
              </Row>
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken py-2 pl-3 pr-2">
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
          )}
        </Section>

        <Section
          title="Your data"
          description="Everything lives in a local SQLite file. Back it up any time."
        >
          <div className="flex flex-wrap gap-2">
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

      <div className="mt-10 flex justify-end border-t border-border pt-5">
        <Button onClick={() => toast({ tone: "success", title: "Settings saved" })}>
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
    <section className="grid gap-x-8 gap-y-4 sm:grid-cols-[200px_1fr]">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            {description}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-border bg-surface px-4">
        {children}
      </div>
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
      className={
        last
          ? "flex items-center justify-between gap-4 py-3.5"
          : "flex items-center justify-between gap-4 border-b border-border py-3.5"
      }
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[0.8125rem] text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
