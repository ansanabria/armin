import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  FileText,
  Package,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { parseMarkdownDeck } from "@/lib/parse-markdown-deck";
import { cn } from "@/lib/utils";

export type ImportSummary = {
  source: "Anki" | "Markdown";
  name: string;
  cardCount: number;
  deckCount?: number;
};

type ImportDeckDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (summary: ImportSummary) => void;
};

type Step = "choose" | "anki" | "markdown";

const MD_PLACEHOLDER = `What does \`typeof null\` return?
::
\`"object"\` — a historical bug kept for compatibility.
Tags: types, gotchas
---
What is a closure?
::
A function bundled with its surrounding lexical scope.`;

export function ImportDeckDialog({
  open,
  onClose,
  onImport,
}: ImportDeckDialogProps) {
  const [step, setStep] = useState<Step>("choose");
  const [displayStep, setDisplayStep] = useState<Step>("choose");
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStep("choose");
      setDisplayStep("choose");
    } else if (open) {
      setDisplayStep(step);
    }
    wasOpenRef.current = open;
  }, [open, step]);

  const visibleStep = open ? step : displayStep;

  const title =
    visibleStep === "anki"
      ? "Import from Anki"
      : visibleStep === "markdown"
        ? "Import from Markdown"
        : "Import deck";

  const description =
    visibleStep === "choose"
      ? "Bring your flashcards in from another tool."
      : undefined;

  const handleExitComplete = () => {
    setStep("choose");
    setDisplayStep("choose");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExitComplete={handleExitComplete}
      title={title}
      description={description}
      className="max-w-lg"
    >
      {visibleStep === "choose" && <ChooseSource onPick={setStep} />}
      {visibleStep === "anki" && (
        <AnkiImport onBack={() => setStep("choose")} onImport={onImport} />
      )}
      {visibleStep === "markdown" && (
        <MarkdownImport onBack={() => setStep("choose")} onImport={onImport} />
      )}
    </Dialog>
  );
}

function ChooseSource({ onPick }: { onPick: (step: Step) => void }) {
  return (
    <div className="space-y-2.5">
      <SourceOption
        icon={Package}
        title="Anki deck"
        description="Import an .apkg or .colpkg export. Basic front/back cards (with tags) come over; other types like cloze are skipped for now."
        onClick={() => onPick("anki")}
      />
      <SourceOption
        icon={FileText}
        title="Markdown file"
        description="Import a .md file using a simple front / back format. Great for notes and version control."
        onClick={() => onPick("markdown")}
      />
    </div>
  );
}

function SourceOption({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors duration-150 hover:border-border-strong hover:bg-bg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-ink" />
    </button>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-1 rounded-sm text-[0.8125rem] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Choose a different source
      </button>
    </div>
  );
}

type AnkiAnalysisResult = Awaited<
  ReturnType<Window["armin"]["import"]["analyzeAnki"]>
>;

function AnkiImport({
  onBack,
  onImport,
}: {
  onBack: () => void;
  onImport: (summary: ImportSummary) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnkiAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [keepSchedule, setKeepSchedule] = useState(true);
  const [strategy, setStrategy] = useState<"single" | "separate">("single");
  const [importing, setImporting] = useState(false);

  const multiDeck = (analysis?.decks.length ?? 0) > 1;
  const needsName = !multiDeck || strategy === "single";

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    setError(null);
    setName("");
    setStrategy("single");
  };

  const handleFile = async (next: File | null) => {
    if (!next) {
      reset();
      return;
    }
    setFile(next);
    setAnalysis(null);
    setError(null);
    setAnalyzing(true);
    try {
      const bytes = new Uint8Array(await next.arrayBuffer());
      const result = await window.armin.import.analyzeAnki(bytes, next.name);
      setAnalysis(result);
      setName(result.suggestedName);
      setStrategy("single");
    } catch (err) {
      setError(errorMessage(err, "We couldn't read that Anki package."));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!analysis) return;
    setImporting(true);
    setError(null);
    try {
      const result = await window.armin.import.commitAnki({
        importId: analysis.importId,
        deckName: name.trim() || "Imported deck",
        keepScheduling: analysis.hasScheduling && keepSchedule,
        deckStrategy: multiDeck ? strategy : "single",
      });
      onImport({
        source: "Anki",
        name:
          result.deckCount > 1
            ? `${plural(result.deckCount, "deck")}`
            : name.trim() || "Imported deck",
        cardCount: result.cardCount,
        deckCount: result.deckCount,
      });
    } catch (err) {
      setError(errorMessage(err, "The import failed. Please try again."));
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackLink onBack={onBack} />

      <FileDrop
        accept=".apkg,.colpkg"
        file={file}
        onFile={(f) => void handleFile(f)}
        hint="Drop an .apkg or .colpkg file, or click to browse"
      />

      <p className="flex items-start gap-2 text-xs text-muted">
        <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Armin imports <span className="text-ink">basic front/back flashcards</span>{" "}
          and their tags. Other flashcard types (like cloze) are skipped for now —
          support for them is coming later.
        </span>
      </p>

      {analyzing && (
        <p className="text-sm text-muted">Reading your Anki package…</p>
      )}

      {error && <PreviewSummary tone="warn" lines={[error]} />}

      {analysis && !analyzing && (
        <>
          {multiDeck && (
            <Field
              label="This package has multiple decks"
              hint={`${analysis.decks.length} decks found`}
            >
              <Segmented
                options={[
                  { value: "single", label: "Merge into one" },
                  { value: "separate", label: "Keep separate" },
                ]}
                value={strategy}
                onChange={setStrategy}
              />
            </Field>
          )}

          {needsName && (
            <Field label="Deck name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}

          {analysis.hasScheduling && (
            <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-bg-2 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  Keep scheduling
                </span>
                <span className="block text-xs text-muted">
                  Carry over review progress and due dates from Anki.
                </span>
              </span>
              <Switch
                checked={keepSchedule}
                onCheckedChange={setKeepSchedule}
              />
            </label>
          )}

          <PreviewSummary
            lines={[
              `${plural(analysis.totalCards, "flashcard")} ready to import`,
              multiDeck && strategy === "separate"
                ? `Across ${plural(analysis.decks.length, "deck")}`
                : "Into a single deck",
            ]}
          />

          {analysis.warnings.length > 0 && (
            <PreviewSummary tone="warn" lines={analysis.warnings} />
          )}
        </>
      )}

      <Footer
        onCancel={onBack}
        disabled={
          !analysis || analyzing || importing || (needsName && !name.trim())
        }
        label={importing ? "Importing…" : "Import deck"}
        onConfirm={() => void handleImport()}
      />
    </div>
  );
}

function MarkdownImport({
  onBack,
  onImport,
}: {
  onBack: () => void;
  onImport: (summary: ImportSummary) => void;
}) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  // The "unrecognized format" warning only appears after a failed import
  // attempt — never while the user is still typing.
  const [attempted, setAttempted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseMarkdownDeck(text), [text]);

  const updateText = (next: string) => {
    setText(next);
    setAttempted(false);
  };

  const handleFile = (file: File | null) => {
    setAttempted(false);
    if (!file) {
      setFileName(null);
      setText("");
      return;
    }
    setFileName(file.name);
    if (!name.trim()) setName(deckNameFromFile(file.name));
    file.text().then(setText);
  };

  const handleImport = async () => {
    if (parsed.cards.length === 0) {
      setAttempted(true);
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const deckName = name.trim() || "Imported deck";
      const result = await window.armin.import.createDeckWithFlashcards({
        name: deckName,
        flashcards: parsed.cards.map((card) => ({
          front: card.front,
          back: card.back,
          tags: card.tags,
        })),
      });
      onImport({
        source: "Markdown",
        name: deckName,
        cardCount: result.flashcardCount,
      });
    } catch (err) {
      setError(errorMessage(err, "The import failed. Please try again."));
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackLink onBack={onBack} />

      <Field label="Deck name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. JavaScript Fundamentals"
        />
      </Field>

      <Segmented
        options={[
          { value: "file", label: "Upload file" },
          { value: "paste", label: "Paste markdown" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "file" ? (
        <FileDrop
          accept=".md,.markdown,.txt"
          file={fileName ? new File([], fileName) : null}
          onFile={handleFile}
          hint="Drop a .md file, or click to browse"
        />
      ) : (
        <Field
          label="Markdown"
          hint="Front and back split by ::, flashcards split by ---"
          info={
            <Tooltip content={<MarkdownFormatHelp />}>
              <button
                type="button"
                aria-label="How the markdown format is recognized"
                className="inline-flex text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          }
        >
          <AutoGrowTextarea
            value={text}
            onChange={(e) => updateText(e.target.value)}
            placeholder={MD_PLACEHOLDER}
            minHeight={160}
            maxHeight={300}
            className="font-mono text-[0.8125rem]"
          />
        </Field>
      )}

      {parsed.cards.length > 0 && (
        <PreviewSummary
          lines={[
            `${plural(parsed.cards.length, "flashcard")} ready to import`,
            ...(parsed.skipped > 0
              ? [
                  `${plural(parsed.skipped, "block")} skipped (missing front or back)`,
                ]
              : []),
          ]}
        />
      )}

      {attempted && parsed.cards.length === 0 && (
        <PreviewSummary
          tone="warn"
          lines={["No flashcards found — check the format"]}
        />
      )}

      {error && <PreviewSummary tone="warn" lines={[error]} />}

      <Footer
        onCancel={onBack}
        disabled={!text.trim() || !name.trim() || importing}
        label={importing ? "Importing…" : "Import deck"}
        onConfirm={() => void handleImport()}
      />
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    // IPC wraps thrown errors; surface the message without the channel prefix.
    return err.message.replace(/^Error invoking remote method '[^']*':\s*/, "");
  }
  return fallback;
}

function FileDrop({
  accept,
  file,
  onFile,
  hint,
}: {
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (file && file.name) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-bg-2 px-3 py-2.5">
        <FileText className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {file.name}
        </span>
        <button
          type="button"
          onClick={() => onFile(null)}
          aria-label="Remove file"
          className="rounded-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          dragging
            ? "border-accent bg-accent-tint"
            : "border-border-strong bg-surface hover:bg-bg-2",
        )}
      >
        <Upload className="h-6 w-6 text-muted" strokeWidth={1.5} />
        <span className="text-sm text-ink">{hint}</span>
        <span className="text-xs text-muted">Accepts {accept}</span>
      </button>
    </>
  );
}

function PreviewSummary({
  lines,
  tone = "ok",
}: {
  lines: string[];
  tone?: "ok" | "warn";
}) {
  const Icon = tone === "warn" ? TriangleAlert : Check;
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        tone === "warn"
          ? "border-relearning/30 bg-relearning-bg text-relearning"
          : "border-review/30 bg-review-bg text-review",
      )}
    >
      <ul className="space-y-1">
        {lines.map((line) => (
          <li key={line} className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer({
  onCancel,
  onConfirm,
  disabled,
  label,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button disabled={disabled} onClick={onConfirm}>
        {label}
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  info,
  children,
}: {
  label: string;
  hint?: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
        {info}
      </span>
      {children}
    </div>
  );
}

function MarkdownFormatHelp() {
  return (
    <div className="space-y-2">
      <p className="font-medium text-ink">How flashcards are detected</p>
      <ul className="space-y-1 text-muted">
        <li>
          Separate flashcards with{" "}
          <code className="rounded bg-surface-sunken px-1 font-mono text-ink">
            ---
          </code>{" "}
          (three dashes on their own line).
        </li>
        <li>
          Split the front and back with{" "}
          <code className="rounded bg-surface-sunken px-1 font-mono text-ink">
            ::
          </code>{" "}
          on its own line.
        </li>
        <li>
          Optionally add{" "}
          <code className="rounded bg-surface-sunken px-1 font-mono text-ink">
            Tags: a, b
          </code>{" "}
          to attach tags.
        </li>
      </ul>
      <p className="font-medium text-ink">Example</p>
      <pre className="overflow-x-auto rounded-md bg-surface-sunken p-2 font-mono text-[0.6875rem] leading-relaxed text-ink">
        {`What is a closure?
::
A function bundled with its
surrounding lexical scope.
Tags: scope
---
What does \`typeof null\` return?
::
\`"object"\` — a historical bug.`}
      </pre>
    </div>
  );
}

function deckNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
