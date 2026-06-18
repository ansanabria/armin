---
name: writing-study-cards
description: Guidelines for structuring spaced-repetition flashcards and prerequisite graphs when creating cards in Armin. Use whenever generating study cards, decks, or prerequisite hierarchies from a topic, notes, or an article (e.g. via the Armin MCP create_flashcard / import_flashcard_hierarchy tools), or when deciding how to chunk content, what to put in a card, and how cards depend on each other.
---

# Writing study cards

Use this before creating cards in Armin so the deck actually produces understanding, not a pile of trivia.

A card (the app calls it a "prompt") is a recurring task you give a future learner. **Prompt design is task design.** Most of the work is _not_ the wording of the question — it's deciding what counts as "knowing" the material, breaking that into discrete pieces, and wiring those pieces into a prerequisite graph.

## The five properties every card must satisfy

Each card you create should be:

1. **Focused** — one detail at a time. Long questions or answers leave parts unrecalled and make it impossible to tell whether the learner remembered everything.
2. **Precise** — unambiguous about what it's asking. Vague questions get vague answers.
3. **Consistent** — the same question produces the same answer every review. Inconsistent answers cause interference and erode memory. (The one deliberate exception: creative prompts — see reference.)
4. **Tractable** — almost always answerable correctly. If it's not, break it down further or add a cue.
5. **Effortful** — the answer must be genuinely _retrieved_, not trivially inferred from the wording. A cue should narrow the search, never give the answer away.

If a card is hard to keep focused/consistent/tractable, its scope is almost always too broad. Split it.

## Workflow

Copy this checklist and work through it:

```
- [ ] 1. Define what it means to "know" this material (list the knowings)
- [ ] 2. Classify each knowing: fact / list / procedure / concept / open list / salience
- [ ] 3. Decompose into discrete, focused units (one detail each)
- [ ] 4. Choose a card type per unit
- [ ] 5. Write the cards, applying the five properties
- [ ] 6. Wire prerequisites (foundations -> dependents)
- [ ] 7. Run the litmus tests; revise
```

### 1. Define what it means to "know" it

Before writing anything, list what a person who _knows_ this topic can do. For a recipe that might be: knows how to make and store it, knows what stock is and why it matters, knows variations and when to use them. This list is your map; every card traces part of it.

### 2–3. Classify, then decompose

Resist the urge to economize on card count. The number of "units of raw knowledge" is fixed by the material — writing fewer, coarser cards does **not** reduce what must be learned, it only makes review harder and less consistent. **Write more cards than feels natural.** Cards are cheap (10–30s/year each); a coarse card that's vague or intractable is expensive.

Caveat: cards are cheap but not free. For material the learner already finds familiar, write fewer cards — there's less marginal knowledge to capture, and reviewing the obvious is demoralizing.

Match card scale to the learner's existing chunk size: a group of facts that's already a single chunk for them ("Italian aromatics") can be one card; otherwise split into individual facts.

The detailed playbook for each knowledge type — facts, explanation pairs, closed lists (cloze), procedures (keyword extraction), concepts (the five lenses), open lists (tag pattern), salience/behavioral, and creative prompts — lives in [reference.md](reference.md). Read it when classifying and decomposing.

### 4. Choose a card type

Armin card types and when to reach for each:

| Type             | Use for                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basic`          | Most cards: a focused question with one answer (facts, explanations, single procedure steps, concept lenses, salience prompts).                                         |
| `basic_reversed` | Term ↔ definition pairs where recall is useful both directions (name → meaning _and_ meaning → name).                                                                   |
| `cloze`          | Closed lists and fill-in-the-blank. One deletion = one review; reuse a number to blank several together. Syntax: `{{1::answer}}`, add a cue with `{{1::answer::hint}}`. |
| `type_answer`    | Short, exact answers (a term, a number, a ratio) where typing forces precise recall.                                                                                    |
| `image_occlusion` | Spatial/visual knowledge — recalling hidden parts, structures, or relationships better seen than described.                                                            |

Default to `basic`. Don't cram multiple facts into one card to save types — make more cards instead.

### 6. Wire prerequisites

This is Armin's core idea: a card stays **locked** until its prerequisites are learned, so foundations come first. Getting the graph right matters as much as the cards.

Rules for prerequisite edges:

- **Make A a prerequisite of B only if you genuinely cannot understand or answer B without already knowing A.** "Related" is not enough — the test is _necessity_, not _relevance_.
- **Foundations point to dependents.** Terms, definitions, and simple facts are prerequisites of explanation, conceptual, integrative, and application cards built on them. The reverse explanation ("_why_ do we use bones?") depends on the plain fact ("bones are used").
- **Order from foundations to dependents** across the whole deck.
- **Keep the graph shallow and meaningful.** A handful of real dependencies beats a dense web. Over-linking locks cards that didn't need to be locked.
- **No cycles.** If two cards each seem to need the other, they're probably one chunk, or the dependency only runs one way.
- When building several related cards at once, prefer `import_flashcard_hierarchy`: assign stable `clientId`s and declare `prerequisites` by `clientId` in a single call.

## Litmus tests (run before finalizing)

- **False positives** — could the learner answer correctly _without_ knowing the target? Watch for pattern-matching on long/unusual wording (cloze deletions copied from text are prone to this) and cues that give the answer away ("rhymes with parrots").
- **False negatives** — could someone who _knows_ the material still miss it because the question admits other correct answers? Add just enough context to exclude alternatives without inviting pattern matching. Prefer expressing general knowledge generally over pinning it to one source.
- **Avoid binary (yes/no, this/that) questions** — they need little effort and produce shallow understanding. Rephrase as open-ended, often by connecting to an example or implication.

Full litmus-test discussion and examples are in [reference.md](reference.md).

## In practice

Your job is to turn a given resource into a **complete tree of cards** the learner can review — not a sampler. The "write a few prompts and iterate" advice meant for a human reading over weeks does **not** apply to you: you have the whole resource in front of you now, so cover it.

- **Cover the resource thoroughly.** Walk the "knowings" from step 1 and decompose every meaningful one into cards. Each load-bearing fact, term, relationship, step, and concept the resource teaches should be reachable through some card. Decompose generously — many focused cards beat a few coarse ones.
- **But don't pad.** Thorough means covering the real units of knowledge, not inventing trivia. Skip the genuinely obvious (common-sense steps, throwaway asides) and details the resource itself treats as incidental. Coverage of what matters, not completionism for its own sake.
- **Deliver one connected tree, not a flat pile.** Emit the whole deck in a single `import_flashcard_hierarchy` call with prerequisites wired so foundations unlock dependents. The graph is part of the deliverable; an unconnected list of cards is an incomplete answer.
- **Set scope to the learner when known.** If told the learner already knows part of the material, write fewer cards there — reviewing the obvious is demoralizing. Absent that signal, assume a motivated beginner and cover the foundations.
- **Make every card individually sound.** Before finishing, re-check each card against the five properties and the litmus tests. A card that's vague, intractable, or untethered from the tree is worse than no card.
