---
name: Armin
description: A calm, Flexoki-inspired spaced-repetition desk for hierarchical knowledge.
colors:
  paper: "oklch(0.987 0.012 95)"
  bg-2: "oklch(0.948 0.012 95)"
  ui: "oklch(0.914 0.012 95)"
  ui-2: "oklch(0.884 0.012 95)"
  ui-3: "oklch(0.854 0.012 95)"
  ink: "oklch(0.16 0.006 60)"
  muted: "oklch(0.52 0.01 95)"
  accent: "oklch(0.52 0.08 180)"
  accent-deep: "oklch(0.44 0.075 180)"
  accent-tint: "oklch(0.94 0.025 180)"
  on-accent: "oklch(0.987 0.012 95)"
  again: "oklch(0.48 0.14 25)"
  hard: "oklch(0.52 0.14 45)"
  good: "oklch(0.52 0.11 120)"
  easy: "oklch(0.45 0.12 250)"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
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
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.on-accent}"
  button-outline:
    backgroundColor: "{colors.paper}"
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
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  state-chip:
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    textColor: "{colors.ink}"
  review-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "48px"
---

# Design System: Armin

## 1. Overview

**Creative North Star: "Ink on Paper"**

Armin should feel like reading on warm cream stock under afternoon window light: editorial, intentional, and quiet. The palette follows [Flexoki](https://stephango.com/flexoki): warm monochromatic paper and ink, with cyan for primary action and focus. Serif headings give editorial voice; sans carries card content, labels, and chrome. The card being learned stays the loudest thing on screen.

This system rejects generic SaaS dashboards (no white-card grids, no cool-gray paper), cluttered Anki chrome, flashy marketing motion, and gamified badges.

**Key Characteristics:**

- Warm Flexoki paper field; surfaces are tonal steps, not pure white cards on gray.
- One accent (cyan) for primary actions, focus, active nav; FSRS hues are reserved semantics.
- Flat by default: hairline borders, shadows only on dialogs and popovers.
- Source Serif 4 for display headings; Inter for UI and card prose; mono for code and keys.
- Keyboard-first with visible cyan focus rings.

## 2. Colors

Flexoki light base ramp on warm paper, with cyan accent and reserved study semantics.

### Paper & UI ramp

- **Paper** (`oklch(0.987 0.012 95)`): page background, review card, inputs.
- **Bg-2** (`oklch(0.948 0.012 95)`): sunken fills, hover rows, due-today bar.
- **Ui / Ui-2 / Ui-3**: border steps for dividers, input strokes, hover borders.

### Ink

- **Ink** (`oklch(0.16 0.006 60)`): primary text (~Flexoki black).
- **Muted** (`oklch(0.52 0.01 95)`): labels, placeholders (≥4.5:1 on paper).

### Accent

- **Accent** (`oklch(0.52 0.08 180)`): primary buttons, focus rings, active nav, due counts.
- **Accent Deep**: hover on primary.
- **Accent Tint**: selection, icon circles, input focus glow.
- **On-accent**: paper-toned text on filled accent and rating buttons.

### Study semantics (reserved)

- **Ratings (filled):** Again (red), Hard (orange), Good (green), Easy (blue). Flexoki 600 values in OKLCH.
- **Card states (soft chips):** pale bg + dark same-hue text, always labelled.

### Named Rules

**Reserved-Semantics Rule.** Rating hues are for review meaning only. Brand accent is cyan, never a rating color.

**Warm-Paper Rule.** The page is warm cream paper. Warmth lives in the field and ink, not in decorative tinted panels.

## 3. Typography

**Display:** Source Serif 4 (page titles, deck names, dialog titles, brand wordmark)
**Body / UI:** Inter
**Mono:** JetBrains Mono (code, keyboard hints, progress counts)

### Hierarchy

- **Display** (600, 1.75rem): "Decks", deck names.
- **Headline** (600, 1.25rem): dialog titles, "All caught up".
- **Title** (500, 1.25rem): card front in review (sans).
- **Body Large** (400, 1.125rem): card back answer.
- **Body** (400–500, 0.875rem): UI text, list rows. Prose capped at ~70ch.
- **Label** (500, 0.75rem): chips, meta.
- **Mono** (400, 0.8125rem): code, `(space)`, `1 / 3`.

**Serif-for-display rule.** Headings use serif; card content and controls stay sans.

## 4. Elevation

Flat by default. Tonal paper steps and hairline borders define structure.

- **Overlay** only: dialogs, dropdowns, toasts (`shadow-overlay`).
- Review card: hairline `ui-2` border, no resting shadow.

## 5. Components

### Buttons

- **Primary:** accent fill, on-accent text. Hover → accent-deep.
- **Outline:** paper surface, ui-2 border; hover fills bg-2.
- **Ghost:** hover fills bg-2.
- **Focus:** 2px accent ring, 2px offset.

### Navigation

- Paper field, hairline bottom border, no glass blur.
- Active route: cyan bottom border + accent text.
- Brand: serif wordmark, accent brain icon.

### Deck list

- Ruled rows (`divide-y`), not floating card grids.
- Serif deck names; sans metadata.

### Review card (signature)

- Centered, max ~52ch, hairline border, generous padding.
- Sans card front/back; accent "Show answer" primary.
- Rating grid: Flexoki semantic fills, paper text, mono intervals.

## 6. Do's and Don'ts

### Do:

- Use Flexoki warm paper + ink ramp for 90% of surfaces.
- Use cyan accent sparingly for primary action, focus, active nav.
- Keep FSRS colors in rating grid and state chips only.
- Use serif for headings, sans for card content.
- Keep focus rings visible (keyboard-first).

### Don't:

- Pure white `#fff` cards on cool-gray paper.
- Clay/petrol or generic SaaS blue-gray palettes.
- Identical floating card grids for deck lists.
- Shadows on list rows or review card at rest.
- Gradient text, side-stripe borders, decorative glass.
