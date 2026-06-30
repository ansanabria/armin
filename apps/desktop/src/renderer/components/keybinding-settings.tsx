/**
 * The keyboard-shortcuts settings surface. Lists every app-level Command grouped
 * by section, lets the user re-record a binding through a modal recorder (press
 * the keys, then Enter to save / Esc to cancel), and resets a single Command or
 * all of them back to the factory defaults.
 *
 * Only the Commands the user changed are persisted (factory ◁ override diff);
 * the provider owns that diffing — this component just calls setBinding/reset.
 */

import { useEffect, useRef, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useToast } from "@/components/ui/toast";
import { KeybindingHint } from "@/components/keybinding-hint";
import { useKeybindings } from "@/keybindings/keybindings-provider";
import {
  COMMANDS,
  COMMAND_BY_ID,
  findConflict,
  findSharedBindingCommands,
  type CommandDef,
  type Conflict,
  type Keymap,
} from "@/lib/keybindings/registry";
import {
  serializeSteps,
  stepFromEvent,
  type ChordStep,
} from "@/lib/keybindings/keys";
import { cn } from "@/lib/utils";

/** Commands grouped by their `group` header, preserving registry order. */
const GROUPS: { group: string; commands: CommandDef[] }[] = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, CommandDef[]>();
  for (const cmd of COMMANDS) {
    if (!byGroup.has(cmd.group)) {
      byGroup.set(cmd.group, []);
      order.push(cmd.group);
    }
    byGroup.get(cmd.group)!.push(cmd);
  }
  return order.map((group) => ({ group, commands: byGroup.get(group)! }));
})();

/** Longest chord the recorder accepts (e.g. "g d"); extra keys are ignored. */
const MAX_CHORD_STEPS = 2;

function describeConflict(conflict: Conflict): string {
  switch (conflict.kind) {
    case "reserved":
      return "That key is reserved by the app and can’t be reassigned.";
    case "duplicate": {
      const label = COMMAND_BY_ID.get(conflict.commandId)?.label ?? "another action";
      return `Already used by “${label}” in this context.`;
    }
    case "prefix": {
      const label = COMMAND_BY_ID.get(conflict.commandId)?.label ?? "another action";
      return `Conflicts with the chord for “${label}”.`;
    }
  }
}

/**
 * Modal keybinding recorder. While open it captures every keystroke (capture
 * phase + stopPropagation, so the live dispatcher never sees the keys being
 * recorded), appending each non-modifier key to the draft chord. Enter saves the
 * draft, Escape cancels; Tab is swallowed so focus stays put. Same-scope
 * conflicts are surfaced inline so the user can re-record without leaving.
 */
function KeybindingRecorderDialog({
  command,
  open,
  keymap,
  onClose,
  onSave,
  onExitComplete,
}: {
  command: CommandDef | null;
  open: boolean;
  keymap: Keymap;
  onClose: () => void;
  onSave: (binding: string) => void;
  onExitComplete: () => void;
}) {
  const [draft, setDraft] = useState<ChordStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset the draft each time the recorder opens.
  useEffect(() => {
    if (open) {
      setDraft([]);
      setError(null);
    }
  }, [open]);

  const confirm = () => {
    if (!command) return;
    if (draft.length === 0) {
      setError("Press a key or chord to record first.");
      return;
    }
    const binding = serializeSteps(draft);
    const conflict = findConflict(keymap, command, binding);
    if (conflict) {
      setError(describeConflict(conflict));
      return;
    }
    onSave(binding);
  };

  // Keep the live key listener pointed at the latest confirm/close handlers
  // without re-attaching it on every keystroke.
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") {
        confirmRef.current();
        return;
      }
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key === "Tab") return; // keep focus put; don't record Tab
      const step = stepFromEvent(event);
      if (!step) return; // bare modifier press — wait for the real key
      setDraft((prev) =>
        prev.length >= MAX_CHORD_STEPS ? prev : [...prev, step],
      );
      setError(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExitComplete={onExitComplete}
      title="Record shortcut"
      description={
        command ? `Set a new shortcut for “${command.label}”.` : undefined
      }
    >
      <div className="space-y-4">
        <div
          className={cn(
            "flex min-h-[3.5rem] items-center justify-center gap-1.5 rounded-md border px-4 py-3",
            error
              ? "border-danger/40 bg-danger/5"
              : "border-border bg-surface-sunken",
          )}
        >
          {draft.length > 0 ? (
            <KeybindingHint binding={serializeSteps(draft)} />
          ) : (
            <span className="text-sm text-muted">
              Press the keys for your shortcut…
            </span>
          )}
        </div>

        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            Press a sequence like <Kbd>G</Kbd> then <Kbd>D</Kbd> to record a
            chord. Press <Kbd>Enter</Kbd> to save or <Kbd>Esc</Kbd> to cancel.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft([]);
              setError(null);
            }}
            disabled={draft.length === 0}
          >
            Clear
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={confirm}
              disabled={draft.length === 0}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function KeybindingSettings() {
  const toast = useToast();
  const { keymap, setBinding, resetCommand, resetAll } = useKeybindings();
  const [editing, setEditing] = useState<CommandDef | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);

  const openRecorder = (cmd: CommandDef) => {
    setEditing(cmd);
    setRecorderOpen(true);
  };

  const handleSave = (binding: string) => {
    const target = editing;
    setRecorderOpen(false);
    if (!target) return;
    setBinding(target.id, binding);

    const shared = findSharedBindingCommands(keymap, target, binding);
    if (shared.length) {
      toast({
        tone: "default",
        title: "Shortcut also used elsewhere",
        description: `Also used by “${shared
          .map((c) => c.label)
          .join("”, “")}” in another context.`,
      });
    }
  };

  const overrides = COMMANDS.filter(
    (c) => keymap[c.id] !== c.defaultBinding,
  ).length;

  return (
    <div className="border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <p className="text-[0.8125rem] text-muted">
          Click a shortcut to record a new one.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={overrides === 0}
          onClick={() => resetAll()}
        >
          <RotateCcw className="h-4 w-4" />
          Reset all
        </Button>
      </div>

      {GROUPS.map(({ group, commands }, groupIndex) => (
        <div key={group}>
          <h3 className="border-b border-border bg-surface-sunken px-4 py-2 text-xs font-medium text-muted">
            {group}
          </h3>
          {commands.map((cmd, index) => {
            const overridden = keymap[cmd.id] !== cmd.defaultBinding;
            const lastRow =
              groupIndex === GROUPS.length - 1 && index === commands.length - 1;
            return (
              <div
                key={cmd.id}
                className={cn(
                  "px-4 py-3",
                  !lastRow && "border-b border-border",
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-ink">{cmd.label}</p>
                  <div className="flex h-8 shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-sm border border-transparent px-2 py-1 hover:border-border hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={`Change shortcut for ${cmd.label}`}
                      onClick={() => openRecorder(cmd)}
                    >
                      <KeybindingHint binding={keymap[cmd.id] ?? ""} />
                      <Keyboard className="h-3.5 w-3.5 text-muted" />
                    </button>
                    {overridden && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Reset shortcut for ${cmd.label}`}
                        title="Reset to default"
                        onClick={() => resetCommand(cmd.id)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <KeybindingRecorderDialog
        command={editing}
        open={recorderOpen}
        keymap={keymap}
        onClose={() => setRecorderOpen(false)}
        onSave={handleSave}
        onExitComplete={() => setEditing(null)}
      />
    </div>
  );
}
