import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type TextareaHTMLAttributes,
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
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { parseMarkdownDeck } from "@/lib/parse-markdown-deck";
import { cn } from "@/lib/utils";

export type ImportSummary = {
  source: "Anki" | "Markdown";
  name: string;
  cardCount: number;
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

  // Reset the whole flow each time the dialog opens.
  useEffect(() => {
    if (open) setStep("choose");
  }, [open]);

  const title =
    step === "anki"
      ? "Import from Anki"
      : step === "markdown"
        ? "Import from Markdown"
        : "Import deck";

  const description =
    step === "choose"
      ? "Bring your cards in from another tool."
      : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className="max-w-lg"
    >
      {step === "choose" && <ChooseSource onPick={setStep} />}
      {step === "anki" && (
        <AnkiImport
          onBack={() => setStep("choose")}
          onImport={onImport}
        />
      )}
      {step === "markdown" && (
        <MarkdownImport
          onBack={() => setStep("choose")}
          onImport={onImport}
        />
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
        description="Import an .apkg or .colpkg export — cards, media, and optionally their scheduling."
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
      className="group flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors duration-150 hover:border-border-strong hover:bg-bg-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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

function AnkiImport({
  onBack,
  onImport,
}: {
  onBack: () => void;
  onImport: (summary: ImportSummary) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [keepSchedule, setKeepSchedule] = useState(true);

  const handleFile = (next: File | null) => {
    setFile(next);
    if (next) setName(deckNameFromFile(next.name));
  };

  // UI preview: a real importer unpacks the SQLite collection. Here we derive a
  // believable card count from the file size so the preview feels alive.
  const cardCount = file ? Math.max(1, Math.round(file.size / 256)) : 0;

  return (
    <div className="space-y-4">
      <BackLink onBack={onBack} />

      <FileDrop
        accept=".apkg,.colpkg"
        file={file}
        onFile={handleFile}
        hint="Drop an .apkg or .colpkg file, or click to browse"
      />

      {file && (
        <>
          <Field label="Deck name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-bg-2/40 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">
                Keep scheduling
              </span>
              <span className="block text-xs text-muted">
                Preserve review history and due dates from Anki.
              </span>
            </span>
            <Switch checked={keepSchedule} onCheckedChange={setKeepSchedule} />
          </label>

          <PreviewSummary
            lines={[
              `${plural(cardCount, "card")} detected`,
              keepSchedule
                ? "Scheduling will be preserved"
                : "Cards will be imported as new",
            ]}
          />
        </>
      )}

      <Footer
        onCancel={onBack}
        disabled={!file || !name.trim()}
        label="Import deck"
        onConfirm={() =>
          onImport({
            source: "Anki",
            name: name.trim() || "Imported deck",
            cardCount,
          })
        }
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

  const handleImport = () => {
    if (parsed.cards.length === 0) {
      setAttempted(true);
      return;
    }
    onImport({
      source: "Markdown",
      name: name.trim() || "Imported deck",
      cardCount: parsed.cards.length,
    });
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
          hint="Front and back split by ::, cards split by ---"
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
            `${plural(parsed.cards.length, "card")} ready to import`,
            ...(parsed.skipped > 0
              ? [`${plural(parsed.skipped, "block")} skipped (missing front or back)`]
              : []),
          ]}
        />
      )}

      {attempted && parsed.cards.length === 0 && (
        <PreviewSummary
          tone="warn"
          lines={["No cards found — check the format"]}
        />
      )}

      <Footer
        onCancel={onBack}
        disabled={!text.trim() || !name.trim()}
        label="Import deck"
        onConfirm={handleImport}
      />
    </div>
  );
}

/**
 * Textarea that grows with its content instead of being manually resizable.
 * Starts at `minHeight`, expands as text is added, and only shows a scrollbar
 * once it reaches `maxHeight`.
 */
function AutoGrowTextarea({
  value,
  minHeight,
  maxHeight,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight: number;
  maxHeight: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    el.style.height = "auto";
    const content = el.scrollHeight + border;
    el.style.height = `${Math.min(maxHeight, Math.max(minHeight, content))}px`;
    el.style.overflowY = content > maxHeight ? "auto" : "hidden";
  }, [value, minHeight, maxHeight]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cn("resize-none", className)}
      style={{ minHeight, maxHeight }}
      {...props}
    />
  );
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
      <div className="flex items-center gap-3 rounded-md border border-border bg-bg-2/40 px-3 py-2.5">
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
            ? "border-accent bg-accent-tint/40"
            : "border-border-strong bg-surface hover:bg-bg-2/40",
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
      <p className="font-medium text-ink">How cards are detected</p>
      <ul className="space-y-1 text-muted">
        <li>
          Separate cards with{" "}
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
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
