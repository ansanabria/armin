/**
 * The keybinding runtime. One per-window `keydown` listener owns the chord
 * buffer and routes keys to Commands over a scope stack, applying precedence,
 * modal isolation, and typing suppression. Components activate their Scope and
 * register handlers via {@link useScope}; the palette, cheatsheet, and settings
 * read the effective keymap from {@link useKeybindings}.
 *
 * See docs/adr/0018 (dispatch) and docs/adr/0019 (per-profile override storage).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsKeys } from "@/lib/armin-query";
import { isEditableTarget } from "@/lib/keybindings/editable";
import {
  serializeSteps,
  stepFromEvent,
  stepHasStrongModifier,
  type ChordStep,
} from "@/lib/keybindings/keys";
import {
  resolve,
  type FireableCommand,
} from "@/lib/keybindings/dispatcher";
import {
  COMMAND_BY_ID,
  diffFromFactory,
  resolveKeymap,
  type CommandId,
  type CommandScope,
  type Keymap,
  type KeybindingOverrides,
} from "@/lib/keybindings/registry";

const CHORD_TIMEOUT_MS = 1000;

export type CommandHandlers = Partial<Record<CommandId, () => void>>;

type ScopeInstance = {
  id: number;
  scope: CommandScope;
  modal: boolean;
  getHandlers: () => CommandHandlers;
};

type KeybindingsContextValue = {
  keymap: Keymap;
  overrides: KeybindingOverrides;
  activeScopes: ReadonlySet<CommandScope>;
  pendingChord: ChordStep[];
  setBinding: (commandId: CommandId, binding: string) => void;
  resetCommand: (commandId: CommandId) => void;
  resetAll: () => void;
  /** Invoke a Command's handler directly (e.g. from the command palette), bypassing key matching and modal isolation. */
  runCommand: (commandId: CommandId) => boolean;
  /** @internal — used by {@link useScope}. */
  _register: (
    scope: CommandScope,
    modal: boolean,
    getHandlers: () => CommandHandlers,
  ) => number;
  /** @internal — used by {@link useScope}. */
  _unregister: (id: number) => void;
};

const KeybindingsContext = createContext<KeybindingsContextValue | null>(null);

function parseOverrides(raw: string | null | undefined): KeybindingOverrides {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as KeybindingOverrides;
  } catch {
    // Corrupt overrides fall back to factory defaults rather than breaking keys.
  }
  return {};
}

export function KeybindingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const hasBackend = typeof window !== "undefined" && Boolean(window.armin);

  const settingsQuery = useQuery({
    queryKey: settingsKeys.current,
    queryFn: () => window.armin.settings.get(),
    enabled: hasBackend,
  });

  const overrides = useMemo(
    () => parseOverrides(settingsQuery.data?.keybindings),
    [settingsQuery.data?.keybindings],
  );
  const keymap = useMemo(() => resolveKeymap(overrides), [overrides]);

  // Keep a live mirror for the keydown closure, which is attached once.
  const keymapRef = useRef(keymap);
  keymapRef.current = keymap;

  const stackRef = useRef<ScopeInstance[]>([]);
  const seqRef = useRef(0);
  const bufferRef = useRef<ChordStep[]>([]);
  const timeoutRef = useRef<number | null>(null);

  const [activeScopes, setActiveScopes] = useState<ReadonlySet<CommandScope>>(
    new Set(),
  );
  const [pendingChord, setPendingChord] = useState<ChordStep[]>([]);

  const recomputeActiveScopes = useCallback(() => {
    setActiveScopes(new Set(stackRef.current.map((i) => i.scope)));
  }, []);

  const _register = useCallback(
    (scope: CommandScope, modal: boolean, getHandlers: () => CommandHandlers) => {
      const id = ++seqRef.current;
      stackRef.current.push({ id, scope, modal, getHandlers });
      recomputeActiveScopes();
      return id;
    },
    [recomputeActiveScopes],
  );

  const _unregister = useCallback(
    (id: number) => {
      stackRef.current = stackRef.current.filter((i) => i.id !== id);
      recomputeActiveScopes();
    },
    [recomputeActiveScopes],
  );

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPendingChord([]);
  }, []);

  const armTimeout = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      bufferRef.current = [];
      timeoutRef.current = null;
      setPendingChord([]);
    }, CHORD_TIMEOUT_MS);
  }, []);

  // Build the set of Commands eligible to fire right now: from the topmost modal
  // (or the stack bottom) up, with a live handler and a binding. Deeper wins.
  const computeFireable = useCallback((): {
    fireable: FireableCommand[];
    instances: { instance: ScopeInstance; depth: number }[];
  } => {
    const stack = stackRef.current;
    let from = 0;
    for (let i = 0; i < stack.length; i++) {
      if (stack[i].modal) from = i;
    }
    const fireable: FireableCommand[] = [];
    const instances: { instance: ScopeInstance; depth: number }[] = [];
    for (let depth = from; depth < stack.length; depth++) {
      const instance = stack[depth];
      instances.push({ instance, depth });
      const handlers = instance.getHandlers();
      for (const commandId of Object.keys(handlers) as CommandId[]) {
        const cmd = COMMAND_BY_ID.get(commandId);
        if (!cmd || cmd.scope !== instance.scope) continue;
        const binding = keymapRef.current[commandId];
        if (!binding) continue;
        fireable.push({ commandId, depth, binding });
      }
    }
    return { fireable, instances };
  }, []);

  const fire = useCallback(
    (
      commandId: CommandId,
      instances: { instance: ScopeInstance; depth: number }[],
    ) => {
      // Call the deepest instance that owns a handler for this Command.
      for (let i = instances.length - 1; i >= 0; i--) {
        const handler = instances[i].instance.getHandlers()[commandId];
        if (handler) {
          handler();
          return;
        }
      }
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const step = stepFromEvent(event);
      if (!step) return;

      // A bare Escape always cancels a pending chord, but never preventDefault —
      // intrinsic dialog/inline-edit Escape handlers must still run.
      if (step.key === "Escape" && !step.mod && !step.alt) {
        if (bufferRef.current.length > 0) clearBuffer();
        return;
      }

      const editable = isEditableTarget(event.target);
      const strong = stepHasStrongModifier(step);

      const { fireable: allFireable, instances } = computeFireable();
      let fireable = allFireable;
      if (editable && !strong) {
        // Bare keys are suppressed while typing unless the Command opts in.
        fireable = fireable.filter(
          (c) => COMMAND_BY_ID.get(c.commandId)?.allowInInput,
        );
      }

      const tryBuffer = (buffer: ChordStep[]): boolean => {
        const res = resolve(buffer, fireable);
        if (res.type === "pending") {
          bufferRef.current = buffer;
          setPendingChord(buffer);
          armTimeout();
          event.preventDefault();
          return true;
        }
        if (res.type === "fire") {
          clearBuffer();
          event.preventDefault();
          fire(res.commandId, instances);
          return true;
        }
        return false;
      };

      const extended = [...bufferRef.current, step];
      if (tryBuffer(extended)) return;
      // The extended buffer led nowhere; let this key start a fresh sequence.
      if (bufferRef.current.length > 0 && tryBuffer([step])) return;
      clearBuffer();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armTimeout, clearBuffer, computeFireable, fire]);

  const persistOverrides = useMutation({
    mutationFn: (next: KeybindingOverrides) =>
      window.armin.settings.update({
        keybindings: Object.keys(next).length ? JSON.stringify(next) : null,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: settingsKeys.current }),
  });

  const commitKeymap = useCallback(
    (next: Keymap) => {
      const diff = diffFromFactory(next);
      // Optimistic local update so keys respond before the round-trip settles.
      queryClient.setQueryData(
        settingsKeys.current,
        (prev: typeof settingsQuery.data) =>
          prev
            ? {
                ...prev,
                keybindings: Object.keys(diff).length
                  ? JSON.stringify(diff)
                  : null,
              }
            : prev,
      );
      if (hasBackend) persistOverrides.mutate(diff);
    },
    [hasBackend, persistOverrides, queryClient, settingsQuery.data],
  );

  const setBinding = useCallback(
    (commandId: CommandId, binding: string) => {
      commitKeymap({ ...keymapRef.current, [commandId]: binding });
    },
    [commitKeymap],
  );

  const resetCommand = useCallback(
    (commandId: CommandId) => {
      const factory = COMMAND_BY_ID.get(commandId)?.defaultBinding ?? "";
      commitKeymap({ ...keymapRef.current, [commandId]: factory });
    },
    [commitKeymap],
  );

  const resetAll = useCallback(() => {
    commitKeymap(resolveKeymap({}));
  }, [commitKeymap]);

  const runCommand = useCallback((commandId: CommandId) => {
    const stack = stackRef.current;
    for (let i = stack.length - 1; i >= 0; i--) {
      const handler = stack[i].getHandlers()[commandId];
      if (handler) {
        handler();
        return true;
      }
    }
    return false;
  }, []);

  const value = useMemo<KeybindingsContextValue>(
    () => ({
      keymap,
      overrides,
      activeScopes,
      pendingChord,
      setBinding,
      resetCommand,
      resetAll,
      runCommand,
      _register,
      _unregister,
    }),
    [
      keymap,
      overrides,
      activeScopes,
      pendingChord,
      setBinding,
      resetCommand,
      resetAll,
      runCommand,
      _register,
      _unregister,
    ],
  );

  return (
    <KeybindingsContext.Provider value={value}>
      {children}
      <ChordIndicator steps={pendingChord} />
    </KeybindingsContext.Provider>
  );
}

export function useKeybindings() {
  const ctx = useContext(KeybindingsContext);
  if (!ctx) {
    throw new Error("useKeybindings must be used within KeybindingsProvider");
  }
  return ctx;
}

/**
 * Activate a Scope and register its Command handlers while mounted. Handlers are
 * read live on each keypress, so closures always see fresh state without
 * re-registering. Pass `{ modal: true }` to isolate Commands beneath this one
 * (used by dialogs and overlays).
 */
export function useScope(
  scope: CommandScope,
  handlers: CommandHandlers,
  options?: { modal?: boolean; enabled?: boolean },
) {
  const ctx = useContext(KeybindingsContext);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const modal = options?.modal ?? false;
  const enabled = options?.enabled ?? true;

  // Depend only on the stable register/unregister callbacks, never the whole
  // context value. Registering updates `activeScopes`, which produces a new
  // context object; depending on that object would re-run this effect, register
  // again, and loop until React bails out with a max-update-depth error.
  const register = ctx?._register;
  const unregister = ctx?._unregister;

  useEffect(() => {
    if (!register || !unregister || !enabled) return;
    const id = register(scope, modal, () => handlersRef.current);
    return () => unregister(id);
  }, [register, unregister, scope, modal, enabled]);
}

/** Push an empty modal Scope so app-level Commands beneath it are suppressed. */
export function useModalIsolation(active: boolean) {
  useScope("global", {}, { modal: true, enabled: active });
}

function ChordIndicator({ steps }: { steps: ChordStep[] }) {
  if (steps.length === 0) return null;
  const text = steps.map((s) => serializeSteps([s])).join(" ");
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-4 right-4 z-[60] rounded-md border border-border-strong bg-surface px-2.5 py-1 font-mono text-xs text-muted shadow-overlay"
    >
      ‹ {text}… ›
    </div>
  );
}
