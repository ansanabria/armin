# A single global graph view replaces the per-deck graph

The prerequisite graph is presented in one global view spanning every deck, and the
per-deck graph view is removed. Edge creation becomes deck-agnostic in this view,
which is what makes cross-deck prerequisites real and flips ADR 0002's single-deck
constraint from a temporary limitation into shipped behavior. Decks survive in the
view only as a grouping/filter lens (cluster/color, "focus this deck"), never as a
wall — consistent with ADR 0002's "decks are folders."

We chose one unified canvas over keeping a separate per-deck route because a global
prerequisite graph has no natural per-deck boundary once edges cross decks, and a
per-deck view would just be a filter state of the same canvas. The cost is scale:
a global graph can hold hundreds of flashcards, so this view requires first-class
search, focus-on-a-flashcard's-neighborhood, and deck/tag filtering from the start
or it becomes an unreadable hairball — which would violate the "quiet, show the
structure honestly" principles.

Relation: this is the UI vehicle for ADR 0002; the two land together (global view +
cross-deck edges are one capability, not two).
