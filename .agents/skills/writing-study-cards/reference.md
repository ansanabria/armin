# Knowledge-type playbook

How to decompose each kind of knowledge into cards, with worked examples. Examples use a chicken-stock recipe. Map every `Q./A.` to an Armin card type (`basic`, `basic_reversed`, `cloze`, `type_answer`, `diagram`).

## Factual knowledge

Raw information with few relationships. Break it into single facts.

```
Q. What type of chicken parts are used in stock?
A. Bones.
```

**Pair facts with explanation cards** when the explanation is interesting or the fact is hard to remember. Explanations make facts meaningful and give them hooks to other ideas. Make the explanation precise:

```
Q. How do bones produce a chicken stock's rich texture?   (better than "Why do we use bones?")
A. They're full of gelatin.
```

The explanation card depends on the plain fact — wire it as a dependent.

## Closed lists -> cloze

A closed list has a fixed set of members (`chicken stock aromatics = onion, carrots, celery, garlic, parsley`). Treat it like a complex fact. Don't ask "name all the aromatics" — it's intractable and inconsistent. Use fill-in-the-blank with **one blank per review**, keeping list order fixed so the learner also learns its shape:

```
Q. Typical chicken stock aromatics:
- onion
- {{1::carrots}}
- {{2::celery}}
- {{3::garlic}}
- {{4::parsley}}
```

In Armin this is one `cloze` card; each number is a separate review. Add a cue when needed — `{{4::parsley::herb}}` — but never one that trivializes recall ("rhymes with parrots" requires no knowledge of stock). A mnemonic can instead live in the answer/parentheses as an optional aid.

Write per-item explanation cards ("why is carrot a good aromatic?") so the learner can regenerate the list without the cloze scaffolding.

## Quantities and interpretation

Writing cards forces interpretation — the first step to understanding beyond the page. Don't ask "how much bone in a batch?" ("batch" is undefined); express the underlying ratio generally:

```
Q. What's the ratio of chicken bones to water in chicken stock?
A. A quart of water per pound of bones.
```

Skip quantities that aren't real units ("a bunch of parsley") — just note them informally.

## Procedural knowledge -> extract keywords

Procedures are lists, but cloze-deleting whole steps is unfocused. First strip each step to its keywords, then drop steps that are common sense (step 1 "combine ingredients", final "store" — obvious once you know what stock is). Turn the load-bearing keywords into focused questions ("play Jeopardy"):

```
Q. At what speed should you heat a pot of ingredients for chicken stock?
A. Slowly.

Q. When making chicken stock, what should you do after the pot reaches a simmer?
A. Lower the temperature to a bare simmer.

Q. How long must chicken stock simmer?
A. 90 minutes.
```

For procedures, capture **conditions/heuristics for moving between steps** (when to lower heat, how long), not obvious verbs. Add "heads-up" cards (how long heating takes) and explanation cards ("why low heat?" → "brighter, cleaner flavor"). Branching procedures: capture the predicates; if complex, use a `diagram`. Phrase uncertain answers tentatively and record the source.

## Conceptual knowledge -> the five lenses

A concept isn't a definition to parrot; design a set of cards that collectively **trace its edges**. Use these lenses as a toolkit (you won't need all of them for every concept):

- **Attributes and tendencies** — what's always / sometimes / never true of it?
  `Q. Why don't stocks usually have a distinctive flavor? A. To stay versatile.`
- **Similarities and differences** — what distinguishes it from adjacent concepts?
  `Q. How is stock different from soup broth? A. Broth has a complete flavor; stock isn't meant to stand alone.`
- **Parts and wholes** — examples, sub-concepts, the broader category it belongs to.
  `Q. Name at least three examples of stock. A. e.g. chicken, vegetable, mushroom, pork.`
- **Causes and effects** — what does it do, why, and when is it used?
  `Q. Why do restaurants use stock instead of water? (two reasons) A. Adds flavor; improves texture.`
- **Significance and implications** — why it matters; make it personally meaningful.
  `Q. What liquid building block explains why simple restaurant dishes beat home renditions? A. Stock.`

A term↔definition pair fits `basic_reversed`, but pairing alone is not "knowing the concept" — add lens cards.

## Open lists -> the tag pattern

An open list grows forever (`ways to use chicken stock`); you don't memorize it. Treat it like a tag and write three kinds of cards:

1. **Instance -> tag** (the workhorse):
   `Q. When puréeing vegetables for soup, how can you add richness without fat? A. Thin with chicken stock instead of water.`
2. **A pattern in the tag**:
   `Q. What should you ask yourself when using water in savory cooking? A. "Should I use stock instead?"`
3. **Fuzzy tag -> examples** (only works alongside the above):
   `Q. Name two ways to use chicken stock. A. e.g. cook grains, steam greens, purée soups, deglaze pans.`

The third card alone fails the consistency property; it needs the instance cards behind it.

## Salience and behavioral prompts

Some cards exist not to *know* a fact but to keep an idea **top of mind** until it connects to real life (extending the "Baader-Meinhof" effect on purpose). Phrase them around the situation where the idea should fire:

```
Q. What should you do with the carcass of a roast chicken?
A. Freeze it and make stock.

Q. To keep the freezer stocked, what should you buy instead of chicken parts?
A. Whole birds.
```

Context-laden, situation-anchored phrasing helps knowledge transfer from theory to practice.

## Creative prompts (the consistency exception)

When a concept applies to many instances, a card can ask for a *new* answer each time:

```
Q. Name a vegetable purée soup to try with chicken stock (one you haven't named before).
A. e.g. potato, parsnip, celeriac, sunchoke, squash, carrot, lentil...
```

This deliberately breaks consistency — the goal is generation, not retrieval. It only works once the learner has enough grounding to produce varied answers, so it belongs downstream of the foundational cards (a dependent in the graph). Use sparingly; its effects are less understood than retrieval cards.

# Litmus tests

## False positives — answerable without knowing

- **Discourage pattern matching.** Long questions with unusual wording get memorized by shape. Keep questions short; be wary of cloze deletions copied verbatim from a text.
- **Don't give the answer away in a cue.** "Rhymes with parrots" → carrots needs no knowledge of stock. A good cue ("herb") narrows the field but leaves retrieval work.

## False negatives — knowing but failing to answer

Usually caused by too little context, so other answers are equally valid. "What's the first step to cook an omelette?" has many right answers six months later. Add enough context to exclude alternatives — but express general knowledge generally rather than pinning it to one provincial source:

```
Bad:  What's the first step in the Bon Appétit Jun '18 omelette recipe?
Good: When making an omelette, how must the pan be prepared before adding the eggs?
```

A card that doesn't exclude alternatives forces the learner to also memorize "what the question is asking" — a smell.

## Avoid binary questions

Yes/no and this/that questions take little effort and produce shallow understanding. Connect to an example or implication instead:

```
Bad:  Does chicken stock make vegetables taste like chicken?  -> No.
Good: How does chicken stock affect the flavor of vegetable dishes?  -> Makes them taste more "complete."
```
