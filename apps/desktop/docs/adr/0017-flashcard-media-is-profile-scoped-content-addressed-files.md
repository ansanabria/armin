# Flashcard media is profile-scoped content-addressed files

Flashcard media lives in each Profile's `media/` directory as content-addressed
image files named `<sha256>.<ext>`, and flashcard content references those files
with profile-relative `armin-media:<sha256>.<ext>` identifiers. This replaces
inline image data in flashcard content while preserving the Profile as the unit
that can be copied, moved, backed up, restored, or deleted independently.

The renderer displays media through a constrained app-controlled URL rather than
persisting filesystem paths, and backups include the `media/` directory alongside
`armin.db`. New write paths must import image bytes into Flashcard media first;
legacy inline data URLs are only an upgrade input, not a supported storage or
authoring format.
