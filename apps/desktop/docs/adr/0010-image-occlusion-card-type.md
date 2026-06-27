# The diagram flashcard type becomes image occlusion

The `diagram` type ("identify the highlighted region", answer = a required text
label) was the wrong model. It is replaced by an **image occlusion** type
(`image_occlusion`) modeled on Anki's Image Occlusion Enhanced: content is a base
image plus a set of **masks** that hide parts of it, and the answer is recalling
what is hidden under the tested mask. Per-mask text labels/hints and shared
header/extra text become **optional** annotations rather than the required answer.

Each mask generates one review unit, keyed by a **stable mask id** as its `subKey`.
This reuses the one-flashcard-→-many-review-units model and honors the subKey
identity contract (ADR 0004): adding, removing, or moving a mask preserves the FSRS
history of the untouched masks. We deliberately do not key on positional ordinals
(as Anki does), because ords shift and would churn history.

Reveal mode is a per-flashcard choice — **Hide All, Guess One** (default; forces
true recall) or **Hide One, Guess One** (more context) — not a global setting,
because different images warrant different modes.

Anki import: Image Occlusion notes map faithfully onto this type (masks → masks,
scheduling history preserved, reveal mode carried over). The previous fallback that
silently coerced unmappable note types into `basic` is removed; recognized-but-
unmappable notes are reported, never imported as something they are not. The exact
Anki occlusion storage format (legacy IO Enhanced fields vs native IO since
2.1.56+) is to be verified against current Anki docs at implementation time.

Consequence: any existing `diagram` flashcards need a migration to the new model,
and the type rename touches the schema, flashcard-types module, editor, and
review UI.
