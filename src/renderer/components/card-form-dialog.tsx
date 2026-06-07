import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

export type CardFormValues = {
  front: string;
  back: string;
  tags: string[];
};

type CardFormDialogProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  cardId?: string | null;
  initialFront?: string;
  initialBack?: string;
  initialTags?: string[];
  onSubmit: (values: CardFormValues) => void;
};

export function CardFormDialog({
  open,
  onClose,
  mode,
  cardId = null,
  initialFront = "",
  initialBack = "",
  initialTags = [],
  onSubmit,
}: CardFormDialogProps) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const [tags, setTags] = useState<string[]>(initialTags);

  useEffect(() => {
    if (!open) return;
    setFront(initialFront);
    setBack(initialBack);
    setTags(initialTags);
  }, [open, initialFront, initialBack, initialTags, cardId]);

  const handleSubmit = () => {
    if (!front.trim() || !back.trim()) return;
    onSubmit({ front: front.trim(), back: back.trim(), tags });
  };

  const editorKey = cardId ?? "new";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit card" : "Add card"}
    >
      <div className="space-y-4">
        <Field label="Front" hint="The prompt or question.">
          <MarkdownEditor
            key={`front-${editorKey}`}
            autoFocus
            aria-label="Card front"
            value={front}
            onChange={setFront}
            placeholder="What does `typeof null` return?"
          />
        </Field>
        <Field label="Back" hint="The answer to recall.">
          <MarkdownEditor
            key={`back-${editorKey}`}
            aria-label="Card back"
            value={back}
            onChange={setBack}
            placeholder={
              '`"object"` — a historical bug kept for compatibility.'
            }
          />
        </Field>
        <Field label="Tags" hint="Press Enter or comma to add.">
          <TagsInput value={tags} onChange={setTags} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!front.trim() || !back.trim()}
            onClick={handleSubmit}
          >
            {mode === "edit" ? "Save changes" : "Add card"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,+$/, "").trim();
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 py-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-ink"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove tag ${tag}`}
            className="rounded-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(draft)}
        aria-label="Add tag"
        placeholder={value.length === 0 ? "e.g. closures, async" : ""}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="h-6 min-w-[8ch] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      {children}
    </div>
  );
}
