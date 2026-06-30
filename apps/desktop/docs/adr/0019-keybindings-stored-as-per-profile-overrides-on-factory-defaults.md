# Keybindings are per-profile overrides layered on factory defaults

The effective keymap is `factory ◁ profile override`. **Factory defaults** are
hardcoded constants in code — the single source of default bindings. A Profile
persists only the bindings the user actually changed, as a small JSON **override
diff** stored in its `settings` table (a new nullable column, alongside
`weights`). Rebinding in the Keyboard settings page only ever edits the current
Profile; per-Command reset drops that key from the diff and reset-all clears it,
both reverting to factory. The profile-picker window has no Profile open, so it
uses the factory defaults and its shortcuts are not rebindable.

Unlike MCP settings — which are a single shared installation concern and live in
`app-settings.json` — keybindings deliberately do **not** use `app-settings.json`
and there is no user-editable global keymap layer. Keeping the override as a diff
(rather than a full snapshot of every binding) means Commands added or default
keys corrected in a later app version reach existing Profiles automatically
instead of being frozen at the version the Profile was last saved on. The cost,
accepted here, is that a power user who keeps several Profiles rebinds in each one
separately; a copied/exported Profile carries its keymap with its study data,
consistent with Profiles being fully isolated, copyable databases (ADR 0008).
