import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { KeybindingHint } from "@/components/keybinding-hint";
import {
  useKeybindings,
  useScope,
} from "@/keybindings/keybindings-provider";
import {
  COMMANDS,
  COMMAND_BY_ID,
  type CommandDef,
} from "@/lib/keybindings/registry";

/**
 * Mounts the discoverability surfaces and the global Commands that open them:
 * the Ctrl/⌘+K command palette and the `?` keyboard cheatsheet. Both read the
 * effective keymap from the provider. Rendered once from the root layout.
 */
export function KeyboardOverlays() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useScope("global", {
    "palette.open": () => setPaletteOpen(true),
    "cheatsheet.open": () => setCheatsheetOpen(true),
  });

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Cheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
    </>
  );
}

type PaletteItem = { value: string; label: string };

function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { keymap, activeScopes, runCommand } = useKeybindings();

  // Palette lists every non-hidden Command; ones whose Scope isn't active right
  // now are shown but disabled (e.g. "Show answer" while not reviewing). Items
  // carry `{ value, label }` so Base UI filters on the human label.
  const items = useMemo<PaletteItem[]>(
    () =>
      COMMANDS.filter((c) => !c.hiddenInPalette).map((c) => ({
        value: c.id,
        label: c.label,
      })),
    [],
  );

  const choose = (id: string) => {
    const cmd = COMMAND_BY_ID.get(id);
    if (!cmd || !activeScopes.has(cmd.scope)) return;
    onClose();
    runCommand(id);
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl p-0">
      <Command items={items} aria-label="Command palette">
        <CommandInput placeholder="Type a command…" autoFocus />
        <CommandEmpty>No commands found.</CommandEmpty>
        <CommandList>
          {(item: PaletteItem) => {
            const cmd = COMMAND_BY_ID.get(item.value);
            if (!cmd) return null;
            const runnable = activeScopes.has(cmd.scope);
            return (
              <CommandItem
                key={item.value}
                value={item}
                disabled={!runnable}
                onClick={() => choose(item.value)}
              >
                <span className="text-muted">{cmd.group}</span>
                <span className="text-border-strong">/</span>
                <span>{cmd.label}</span>
                <CommandShortcut>
                  {runnable ? (
                    <KeybindingHint binding={keymap[item.value] ?? ""} />
                  ) : (
                    <span className="text-xs text-muted">unavailable here</span>
                  )}
                </CommandShortcut>
              </CommandItem>
            );
          }}
        </CommandList>
      </Command>
    </Dialog>
  );
}

function Cheatsheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { keymap, activeScopes } = useKeybindings();

  const groups = useMemo(() => {
    const byGroup = new Map<string, CommandDef[]>();
    for (const cmd of COMMANDS) {
      const list = byGroup.get(cmd.group) ?? [];
      list.push(cmd);
      byGroup.set(cmd.group, list);
    }
    return [...byGroup.entries()];
  }, []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      className="max-w-2xl"
    >
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {groups.map(([group, cmds]) => {
          const active = activeScopes.has(cmds[0].scope);
          return (
            <section key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {group}
                {!active && (
                  <span className="ml-2 font-normal normal-case opacity-70">
                    (inactive)
                  </span>
                )}
              </h3>
              <ul className={active ? undefined : "opacity-50"}>
                {cmds.map((cmd) => (
                  <li
                    key={cmd.id}
                    className="flex items-center justify-between gap-4 py-1.5 text-sm"
                  >
                    <span className="text-ink">{cmd.label}</span>
                    <KeybindingHint binding={keymap[cmd.id] ?? ""} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
