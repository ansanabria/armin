---
name: Armin
description: A calm, local-first spaced-repetition desk for hierarchical knowledge.
colors:
  clay: "oklch(0.52 0.13 47)"
  clay-deep: "oklch(0.46 0.135 46)"
  clay-tint: "oklch(0.95 0.03 55)"
  petrol: "oklch(0.40 0.09 220)"
  petrol-tint: "oklch(0.95 0.025 220)"
  bg: "oklch(0.985 0.002 250)"
  surface: "oklch(1 0 0)"
  surface-sunken: "oklch(0.965 0.003 250)"
  border: "oklch(0.92 0.003 250)"
  border-strong: "oklch(0.87 0.004 250)"
  ink: "oklch(0.26 0.008 60)"
  muted: "oklch(0.48 0.006 60)"
  again: "oklch(0.55 0.17 27)"
  hard: "oklch(0.62 0.14 70)"
  good: "oklch(0.56 0.13 150)"
  easy: "oklch(0.55 0.13 245)"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  body-lg:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.005em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.clay}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.clay-deep}"
    textColor: "{colors.surface}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.again}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  state-chip:
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  review-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "40px"
---

# Design System: Armin

## 1. Overview

**Creative North Star: "The Study Notebook"**

Armin should feel like a well-kept personal notebook, not a productivity dashboard. Paper-calm surfaces, ink-clear type, and a structure you can trust at a glance: what's due, what's learned, what's locked behind a prerequisite. The interface is a quiet place to do focused work over weeks and months, so it stays out of the way and lets the card being learned be the loudest thing on screen. Warmth is carried by a single clay accent and the typography, never by a tinted, busy background.

This system explicitly rejects four things, drawn straight from the product's anti-references. It is **not a generic SaaS dashboard**: no cards-everywhere grids, no blue gradients, no hero-metric panels. It is **not cluttered like Anki**: power lives behind a calm surface, never dumped into the first screen. It is **not a flashy marketing site**: motion conveys state, it never decorates. And it is **not gamified or childish**: encouragement is adult and understated, with no mascots, confetti, or loud badges.

Density is moderate and reading-first. The page sits on a near-white paper bg; content panels are pure-white cards that lift by being a half-step brighter than the page, separated by hairline borders rather than shadows. One warm clay carries identity and primary action; one deep petrol carries links and the prerequisite graph; the four FSRS rating colors (red / amber / green / blue) are a reserved semantic vocabulary that the brand never borrows from.

**Key Characteristics:**
- Paper-calm light surface; warmth comes from the clay accent and ink, not the background.
- One brand color (clay) + one accent (petrol); rating and state colors are semantic, not decorative.
- Flat by default: tonal layering and hairline borders, shadows only on floating elements.
- Single sans for the whole UI; mono reserved for code on cards and keyboard hints.
- Keyboard-first, so focus states are always visible and never subtle.

## 2. Colors

A warm clay identity sitting on cool-neutral paper, with a strict, reserved semantic palette for review states.

### Primary
- **Clay** (`oklch(0.52 0.13 47)`): the brand. Primary buttons, the active nav mark, current selection, the brand wordmark icon. A deep, grown-up terracotta, not a bright orange. Always carries white text. Hover/active deepen to **Clay Deep** (`oklch(0.46 0.135 46)`).
- **Clay Tint** (`oklch(0.95 0.03 55)`): a pale clay wash for selected rows, subtle hover fills, and the focus glow on inputs. Never used for text.

### Secondary
- **Petrol** (`oklch(0.40 0.09 220)`): the accent and counterpoint to clay. Text links, secondary emphasis, focus rings, and the edges/nodes of the prerequisite-graph canvas. Deliberately darker and cooler than the blue "Easy" rating so the two never read as the same thing. **Petrol Tint** (`oklch(0.95 0.025 220)`) backs informational callouts.

### Neutral
- **Ink** (`oklch(0.26 0.008 60)`): all headings and body text. A near-black with a whisper of warmth, like old book ink. ~13:1 on paper.
- **Muted** (`oklch(0.48 0.006 60)`): secondary text, captions, field labels, meta. Tuned to clear 4.5:1 on paper, so it is also the **minimum** color for placeholder text. Never go lighter for "elegance."
- **Paper** (`oklch(0.985 0.002 250)`): the page background.
- **Surface** (`oklch(1 0 0)`): pure white, for cards, panels, inputs, the nav bar. Lifts off the paper by being a half-step brighter.
- **Surface Sunken** (`oklch(0.965 0.003 250)`): insets, hover fills on ghost controls, the divider rule on the review card.
- **Border** (`oklch(0.92 0.003 250)`): hairline dividers and card edges. **Border Strong** (`oklch(0.87 0.004 250)`): input and control strokes.

### The Study Semantics (reserved scale)
The review vocabulary is a closed set the brand does not draw from. Two presentations, never mixed:
- **Ratings, filled (white text):** Again `oklch(0.55 0.17 27)`, Hard `oklch(0.62 0.14 70)`, Good `oklch(0.56 0.13 150)`, Easy `oklch(0.55 0.13 245)`. Solid fills, used only in the rating grid.
- **Card states, soft (pale bg + dark text):** New (blue), Learning (amber), Review (green), Relearning (orange). Each chip pairs its hue with a `~oklch(0.95 0.04 H)` background and a `~oklch(0.43 0.10 H)` text, and always shows its text label, so meaning never rides on color alone.

### Named Rules
**The Reserved-Semantics Rule.** Red, amber, green, and blue belong to review meaning (Again / Hard / Good / Easy and the matching states). The brand never uses them decoratively, and the brand color is never one of them. If a UI element needs "an accent," it is clay or petrol, never a rating hue.

**The Carried-Warmth Rule.** Warmth lives in clay and ink, never in the background. The page is cool-neutral paper. Tinting the bg warm to "feel cozy" while the primary is also warm is forbidden; that is the cliché this brand is built to avoid.

## 3. Typography

**Display / Body Font:** Inter (with `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto` fallback, which is what ships today)
**Mono Font:** JetBrains Mono (with `ui-monospace, SFMono-Regular, Menlo` fallback)

**Character:** One humanist-leaning sans does all the UI work, from page titles to labels; hierarchy comes from weight and size, not a second display face. Mono is reserved for the things that are literally code or keys: programming flashcard content, card metadata, and the keyboard-shortcut hints that make review fast. Sizes are a fixed rem scale (≈1.2 ratio), not fluid clamps, because a desktop app is viewed at consistent DPI.

### Hierarchy
- **Display** (700, 1.5rem/24px, -0.01em): page titles ("Decks", deck name). `text-wrap: balance`.
- **Headline** (600, 1.25rem/20px): dialog titles, the "All caught up!" state, section headers.
- **Title** (500, 1.25rem/20px): the card **front** in review, the focal prompt.
- **Body Large** (400, 1.125rem/18px, line-height 1.55): the card **back** answer; longer reading.
- **Body** (400–500, 0.875rem/14px, line-height 1.5): default UI text, buttons, list rows. Prose capped at ~70ch.
- **Label** (500, 0.75rem/12px): state chips, field labels, meta rows, stat counts. Sentence case.
- **Mono** (400, 0.8125rem/13px): code on card faces, keyboard hints like `(space)`, card identifiers.

### Named Rules
**The One-Family Rule.** Inter carries every label, button, heading, and paragraph. Reach for mono only when the content is code or a key. A second display typeface is prohibited; if a heading needs more presence, add weight, not a new font.

**The Sentence-Case Rule.** Labels and chips are sentence case. No all-caps tracked eyebrows above sections; the kicker pattern is banned here.

## 4. Elevation

Flat by default. Depth is built from a two-tone tonal step (paper page vs. pure-white surface) plus hairline borders, not from shadows. Most surfaces, deck cards, list rows, inputs, the nav, sit flat at rest. A shadow appears only on something that genuinely floats above the page.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px oklch(0.26 0.008 60 / 0.05), 0 1px 3px oklch(0.26 0.008 60 / 0.06)`): the single resting elevation, reserved for the review card, the one focal surface in the app.
- **Overlay** (`box-shadow: 0 12px 40px -8px oklch(0.26 0.008 60 / 0.22)`): dialogs and any popover/dropdown. Soft, warm-tinted, never a hard black drop shadow.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; their edge is a hairline border on a tonal step. A shadow is permission to float, granted only to the review card (Lift) and to overlays (Overlay). If a card has a shadow just to look "designed," remove it. If it looks like a 2014 app, the shadow is too dark and the blur is too tight.

## 5. Components

Consistent affordances across every screen: the same button shapes, one form-control vocabulary, one icon style (Lucide, 1.5px stroke, 16–20px). Every interactive element ships default, hover, focus-visible, and disabled states; nothing half-built.

### Buttons
- **Shape:** gently rounded (8px / `rounded.md`), 36px tall default; `sm` 32px, `lg` 44px; `icon` 36×36.
- **Primary:** clay fill, white text, `padding: 8px 16px`. Hover deepens to clay-deep. This replaces the old neutral-900 default; primary action is the brand color.
- **Outline:** white surface, strong border, ink text; hover fills surface-sunken.
- **Ghost:** transparent, ink text; hover fills surface-sunken. For low-emphasis and icon actions (edit, delete).
- **Destructive:** "Again" red fill, white text; for irreversible actions only.
- **Focus / Disabled:** focus-visible draws a 2px petrol ring with a 2px offset (always clearly visible, this is a keyboard-first app). Disabled drops to 50% opacity and removes pointer events.

### Inputs / Fields
- **Style:** white surface, strong border, 8px radius, 36px tall, ink text.
- **Focus:** border shifts to clay and a 2px clay-tint ring appears. No glow, no color flood.
- **Placeholder:** muted (`oklch(0.48 ...)`), never lighter, so it clears 4.5:1.
- Textareas share the vocabulary at `min-height: 80px`, top-aligned padding.

### State Chips
- **Style:** soft pastel background (`~oklch(0.95 0.04 H)`) with dark same-hue text (`~oklch(0.43 0.10 H)`), 6px radius, label type, `padding: 2px 8px`.
- **Always labelled:** the word (New / Learning / Review / Relearning) is present, so color is reinforcement, not the only signal. Color-blind safe by construction.

### Cards / Containers
- **Corner Style:** 12px (`rounded.lg`) for deck cards and dialogs.
- **Background:** white surface on the paper page.
- **Shadow Strategy:** none at rest (see Flat-By-Default). Hover deepens the border and/or fills surface-sunken; no lift animation.
- **Border:** 1px hairline border at rest; 1px border-strong on hover. Empty states use a dashed border-strong.
- **Internal Padding:** 20–24px.

### Navigation
- **Style:** sticky top bar, 56px tall, white surface at ~80% opacity with a backdrop blur (the one deliberate glass moment in the app, used for the scroll-under header only), hairline bottom border.
- **Brand mark:** Brain icon in clay + "Armin" wordmark in ink, semibold.
- **Links:** ghost treatment; current route mark uses clay. Settings is a muted ghost link that inks-up on hover.

### Review Card (signature)
The focal surface of the product. 16px radius (`rounded.xl`), white, generous 40px padding, centered, the single element allowed the **Lift** shadow. Card **front** is Title type; on flip, a 24px hairline divider (surface-sunken) separates the **back** in Body Large. Below it, either a full-width clay "Show answer (space)" primary button or, once flipped, the rating grid.

### Rating Grid (signature)
A 4-column grid of filled semantic buttons: Again / Hard / Good / Easy, left to right, each white-on-color with its FSRS interval preview ("2 days", "1 week") as a mono sub-label. Driven by keys 1–4. This is the only place the filled rating colors appear. The "Show answer" button and the rating grid never display at the same time, so clay and the amber "Hard" never sit side by side.

## 6. Do's and Don'ts

### Do:
- **Do** make the brand clay (`oklch(0.52 0.13 47)`) and the accent petrol (`oklch(0.40 0.09 220)`) the only non-semantic colors; let everything else be neutral.
- **Do** keep review meaning in the reserved red/amber/green/blue scale, and always pair a state color with its text label.
- **Do** keep surfaces flat with hairline borders; grant a shadow only to the review card and to overlays.
- **Do** keep focus rings boldly visible (2px petrol, 2px offset). This is a keyboard-first study tool.
- **Do** size type on the fixed rem scale and let weight carry hierarchy with one sans family.
- **Do** hold body, label, and placeholder text to ≥4.5:1; lean ink, not light gray.

### Don't:
- **Don't** build a **generic SaaS dashboard**: no blue gradients, no hero-metric panels, no decorative card grids of icon + heading + text.
- **Don't** get **cluttered like Anki**: keep depth and options behind a calm first screen, never dumped into view.
- **Don't** make it a **flashy marketing site**: no decorative motion, no gradient-as-decoration, nothing that competes with the card being learned.
- **Don't** go **gamified or childish**: no mascots, confetti storms, or loud badges; encouragement stays adult and quiet.
- **Don't** use the brand clay as a rating color, or a rating color as decoration. They are different vocabularies.
- **Don't** tint the page background warm to "feel cozy." Warmth is clay and ink; the page stays cool-neutral paper.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored stripe, gradient text (`background-clip: text`), or decorative glassmorphism. The nav backdrop-blur is the single sanctioned glass use.
- **Don't** add all-caps tracked eyebrows above sections, or numbered `01 / 02` section markers.
