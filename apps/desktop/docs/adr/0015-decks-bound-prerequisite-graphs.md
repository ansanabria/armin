# Decks bound prerequisite graphs

Decks are isolated study spaces for prerequisite relationships. A prerequisite
edge may only connect flashcards in the same deck, and every graph view is owned
by one deck.

Implementation consequences:

- Remove the top-level global graph view.
- Add a deck-owned graph route, opened from the deck detail route.
- The graph service rejects cross-deck prerequisite edges.
- The migration deletes existing cross-deck prerequisite edges and recomputes
  affected lock state.
- Agent-facing graph reads require a deck id. Agent-facing prerequisite edge
  edits stay flashcard-id based and rely on the shared graph service to enforce
  same-deck membership.
- Moving a flashcard to another deck is allowed. If the flashcard has
  prerequisite or dependent edges, the move flow warns that those links will be
  deleted and affected locks will be recomputed. Isolated flashcards move
  without that warning.
- The card tile actions menu owns the move flow. It opens a dialog where the
  destination deck is selected and connected-card consequences are summarized
  before confirmation.
- Moving a flashcard resets its saved graph canvas position so the destination
  deck can place it in its own layout.

Out of scope: all-decks review, browse, and cram remain available. Deck isolation
applies to prerequisite relationships and graph editing/viewing, not to every way
of studying or finding cards.
