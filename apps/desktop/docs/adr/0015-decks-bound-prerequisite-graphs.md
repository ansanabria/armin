# Decks bound prerequisite graphs

Decks are isolated study spaces for prerequisite relationships. A prerequisite
edge may only connect flashcards in the same deck, and every graph view is owned
by one deck.

Consequences: the graph service rejects cross-deck prerequisite edges, and there is
no top-level global graph view — every graph is opened from its owning deck.
Agent-facing graph reads require a deck id; agent-facing edge edits stay
flashcard-id based and rely on the shared graph service to enforce same-deck
membership. Moving a flashcard to another deck is allowed, but if it has
prerequisite or dependent edges the move warns that those links will be deleted
and affected locks recomputed; the moved flashcard's saved canvas position resets
so the destination deck can place it in its own layout.

Out of scope: all-decks review, browse, and cram remain available. Deck isolation
applies to prerequisite relationships and graph editing/viewing, not to every way
of studying or finding cards.
