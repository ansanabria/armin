# subKey identity preserves FSRS history across flashcard type changes

A flashcard's FSRS scheduling history lives on its review units, which are matched
across edits by `subKey`: a surviving subKey keeps its history, a vanished one is
deleted. We commit to a **subKey identity contract** so that converting a flashcard
between single-front types preserves the history of the direction that did not
conceptually change.

The primary (front→back) direction uses subKey `""` across `basic`, `type_answer`,
and `basic_reversed`; the reverse direction of `basic_reversed` uses `"rev"`. So
`basic → basic_reversed` keeps the original review unit as the forward unit and
merely *adds* the reverse, instead of deleting the mastered review unit and
starting both directions from zero. We chose `""` as the canonical forward key because `basic`
and `type_answer` already use it, minimizing migration to a one-time rename of
existing `basic_reversed` forward units (`"fwd"` → `""`).

Related guard: agent/MCP-authored cloze content must be normalized to explicit
cluster numbers on write, so positional renumbering of bare `{{…}}` deletions can
never silently churn `c{n}` subKeys and destroy history.

Consequence: when a conversion genuinely removes a direction (e.g.
`basic_reversed → basic`), the removed unit's history is still dropped — preservation
applies only where the direction survives.
