/**
 * The keyboard-shortcuts settings surface. Lists every app-level Command grouped
 * by section, lets the user re-record a binding (press-to-record, auto-detecting
 * chords), surfaces same-scope conflicts inline, and resets a single Command or
 * all of them back to the factory defaults.
 *
 * Only the Commands the user changed are persisted (factory ◁ override diff);
 * the provider owns that diffing — this component just calls setBinding/reset.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeybindingHint } from "@/components/keybinding-hint";
import { useKeybindings } from "@/keybindings/keybindings-provider";
import {
  COMMANDS,
  COMMAND_BY_ID,
  findConflict,
  findSharedBindingCommands,
  type CommandDef,
  type CommandId,
  type Conflict,
  type Keymap,
} from "@/lib/keybindings/registry";
import {
  serializeSteps,
  stepFromEvent,
  type ChordStep,
} from "@/lib/keybindings/keys";
import { cn } from "@/lib/utils";

/** How long after the last keypress a recorded sequence is committed. */
const RECORD_COMMIT_MS = 700;

type RowNote = { id: CommandId; tone: "error" | "info"; text: string };

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
 * Capture keystrokes while `active`, building a chord step-by-step. A short idle
 * after the last key commits the sequence (so "g" then "d" records as the chord
 * "g d"); Escape cancels. Capture-phase + stopPropagation keeps the live
 * dispatcher from acting on the keys being recorded.
 */
function useKeyRecorder(
  active: boolean,
  onCommit: (binding: string) => void,
  onCancel: () => void,
) {
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [draft, setDraft] = useState<ChordStep[]>([]);

  useEffect(() => {
    if (!active) return;
    const steps: ChordStep[] = [];
    setDraft([]);
    let timer: number | null = null;
    const clear = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const commit = () => {
      clear();
      if (steps.length > 0) onCommitRef.current(serializeSteps(steps));
      else onCancelRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        clear();
        onCancelRef.current();
        return;
      }
      const step = stepFromEvent(event);
      if (!step) return; // bare modifier press — keep waiting for the real key
      steps.push(step);
      setDraft([...steps]);
      clear();
      timer = window.setTimeout(commit, RECORD_COMMIT_MS);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clear();
    };
  }, [active]);

  return draft;
}

export function KeybindingSettings() {
  const { keymap, setBinding, resetCommand, resetAll } = useKeybindings();
  const [recordingId, setRecordingId] = useState<CommandId | null>(null);
  const [note, setNote] = useState<RowNote | null>(null);

  // Stable refs so the recorder listener can attach once per recording session.
  const recordingRef = useRef<CommandId | null>(null);
  recordingRef.current = recordingId;
  const keymapRef = useRef<Keymap>(keymap);
  keymapRef.current = keymap;

  const commit = useCallback(
    (binding: string) => {
      const id = recordingRef.current;
      setRecordingId(null);
      if (!id) return;
      const target = COMMAND_BY_ID.get(id);
      if (!target) return;

      const conflict = findConflict(keymapRef.current, target, binding);
      if (conflict) {
        setNote({ id, tone: "error", text: describeConflict(conflict) });
        return;
      }
      setBinding(id, binding);

      const shared = findSharedBindingCommands(keymapRef.current, target, binding);
      setNote(
        shared.length
          ? {
              id,
              tone: "info",
              text: `Also used by “${shared
                .map((c) => c.label)
                .join("”, “")}” in another context.`,
            }
          : null,
      );
    },
    [setBinding],
  );

  const cancel = useCallback(() => setRecordingId(null), []);
  const draft = useKeyRecorder(recordingId !== null, commit, cancel);

  const startRecording = (id: CommandId) => {
    setNote(null);
    setRecordingId(id);
  };

  const overrides = COMMANDS.filter(
    (c) => keymap[c.id] !== c.defaultBinding,
  ).length;

  return (
    <div className="border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <p className="text-[0.8125rem] text-muted">
          Press the keys for a shortcut while recording. Press a sequence like{" "}
          <span className="font-mono text-ink">g</span> then{" "}
          <span className="font-mono text-ink">d</span> to record a chord.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={overrides === 0}
          onClick={() => {
            setNote(null);
            setRecordingId(null);
            resetAll();
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Reset all
        </Button>
      </div>

      {GROUPS.map(({ group, commands }, groupIndex) => (
        <div key={group}>
          <h3 className="bg-surface-sunken px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {group}
          </h3>
          {commands.map((cmd, index) => {
            const recording = recordingId === cmd.id;
            const overridden = keymap[cmd.id] !== cmd.defaultBinding;
            const rowNote = note?.id === cmd.id ? note : null;
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    {recording ? (
                      <>
                        <span className="flex min-w-[7rem] items-center justify-end gap-1.5 rounded-sm border border-accent/60 bg-accent/5 px-2 py-1">
                          {draft.length > 0 ? (
                            <KeybindingHint binding={serializeSteps(draft)} />
                          ) : (
                            <span className="text-xs text-accent">
                              Press keys…
                            </span>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Stop recording"
                          onClick={cancel}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-sm border border-transparent px-2 py-1 hover:border-border hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          aria-label={`Change shortcut for ${cmd.label}`}
                          onClick={() => startRecording(cmd.id)}
                        >
                          <KeybindingHint binding={keymap[cmd.id] ?? ""} />
                          <Keyboard className="h-3.5 w-3.5 text-muted" />
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Reset shortcut for ${cmd.label}`}
                          title="Reset to default"
                          disabled={!overridden}
                          className={cn(!overridden && "invisible")}
                          onClick={() => {
                            if (note?.id === cmd.id) setNote(null);
                            resetCommand(cmd.id);
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {rowNote && (
                  <p
                    className={cn(
                      "mt-1.5 text-xs",
                      rowNote.tone === "error" ? "text-danger" : "text-muted",
                    )}
                  >
                    {rowNote.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
