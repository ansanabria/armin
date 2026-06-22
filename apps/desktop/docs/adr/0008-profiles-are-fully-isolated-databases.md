# Profiles are fully isolated, each backed by its own database

Each profile gets its own SQLite database (`userData/profiles/<id>/armin.db`) and
shares nothing with other profiles — not decks, flashcards, schedule, tags, or
settings (FSRS params and learned weights included). A profile is a self-contained
folder that can be copied, moved, or deleted independently, and several profiles
can be open at once.

We chose total isolation over sharing scheduling configuration across profiles. It
mirrors the architecture honestly (one database per profile), keeps the
local-first model simple and accountless, and avoids hidden coupling. The
counter-argument — that FSRS weights are personal to the human and could be pooled
across a single person's profiles — is real but minor for a personal app and would
break the clean "profile = independent database" boundary.

Consequences: settings must be tuned per profile; FSRS weight optimization cannot
pool review history across profiles; and because multiple profiles can be open,
any agent/MCP write must first resolve which profile it targets
(`list_open_profiles` + `select_profile`). A profile is explicitly not an account.
