# Keybindings run through a central dispatcher over a Command registry

App-wide keyboard handling is owned by a single per-window dispatcher that holds
one `keydown` listener and a chord-sequence buffer, rather than the previous
pattern of each component attaching its own `window.addEventListener("keydown")`
with inline `e.key` checks. App-level actions are modelled as **Commands** (a
stable id, a human label, an invocable handler) belonging to a **Scope**
(`global`, or a route scope such as `review`/`cram`). Components activate their
Scope while mounted; a keypress resolves to the deepest active Scope that binds it
and otherwise falls through, so the same key can mean different things in
different contexts (e.g. `1`–`4` rate a review unit only inside the `review`
Scope).

The registry deliberately covers **only app-level actions** — navigation
(`nav.decks`, `nav.cram`, …), review actions (`review.flip`,
`review.rate.again`, …), cram actions, and opening the command palette and
cheatsheet. Widget and OS conventions are **not** Commands and stay as their
existing intrinsic handlers, untouched by the dispatcher: Escape-closes-dialog
and the Tab focus-trap (owned by the Base UI `Dialog` primitive),
Enter-submits-form, Enter/comma tag entry, inline graph-rename confirm/cancel,
and editor formatting (`Ctrl+Shift+C`). Keeping these out of the keymap means
there is nothing for a user to rebind that could orphan a modal or break a form,
so no "protected binding" machinery is needed.

We chose one dispatcher over per-component `useKeybinding` hooks because chords
(`g d`) need a single sequence buffer and conflict detection needs global
knowledge of every binding — both are awkward to coordinate across many
independent listeners. A **chord** waits ~1000ms for its next key; a mismatch or
timeout silently resets the buffer and Escape always cancels. Bindings with no
Ctrl/Cmd/Alt modifier are suppressed while focus is in an editable target (so
typing `1` in a field never rates a card), with a per-Command override for
exceptions; modifier bindings fire regardless.

## Consequences

A `modal` Scope is **isolating**: while a dialog or the command palette is open it
suppresses fall-through to the app-level Commands beneath it (so a stray `g d`
behind an open dialog does nothing), while the dialog's own intrinsic Escape/Tab
handlers run as normal native/library events. The discoverability surfaces — a
`?` cheatsheet overlay and a `Ctrl+K` command palette (built on the shadcn Base UI
`Command` component) — are pure consumers of the registry: the cheatsheet lists
every Command grouped by Scope (dimming inactive ones) and the palette searches
and runs them. Cross-platform combos store a canonical `Mod` token (⌘ on macOS,
Ctrl elsewhere) rendered per platform.
