---
description: 'WCAG 2.2 AA rules for the dashboard: semantic structure, accessible names, keyboard operation, focus, live regions, colour contrast, non-visual chart alternatives, target size, and reduced motion. Use when adding or changing any user-facing markup or interaction.'
applyTo: 'src/client/**/*.jsx'
---

# Accessibility Rules — WCAG 2.2 AA

Accessibility is a **legal requirement**, not a polish item. This service is not a GOV.UK Design
System service, so there are no GDS component defaults to inherit it from — every control and chart
has to earn it explicitly.

## Structure

- One `<h1>` per page; headings descend without skipping levels.
- Use real landmarks — `<header>`, `<main>`, `<nav>`, `<section>` — not `<div>` with a class.
- Lists are `<ul>` / `<ol>`; tabular data is a `<table>` with a `<caption>` and `scope`ed headers.

## Accessible names

Every interactive element has one, and it describes the action:

```jsx
// WRONG — no name for a screen reader
<button onClick={toggleTheme}>🌙</button>

// CORRECT
<button onClick={toggleTheme} aria-label="Switch to light theme">
  <span aria-hidden="true">🌙</span>
</button>
```

Decorative glyphs — icons, chart symbols, arrows — always carry `aria-hidden="true"` so they are not
announced as stray characters.

## Keyboard

- Everything operable by mouse is operable by keyboard. A chart's `onSelect` is mouse-only, so any
  drill-down it offers must also exist as a focusable control or a row in the data table.
- Never remove the focus indicator. Use the shared `focus-ring` class rather than `outline: none`.
- A popover closes on `Escape` and on outside click, and does not trap focus unless it is a modal.
- Do not add `tabindex` greater than zero.

## State and live regions

- Toggles expose `aria-expanded`, and `aria-controls` when they control another element.
- Status that changes without user action — connection state, the active time window — is announced
  through `role="status"` with `aria-live="polite"`.
- Errors that need attention use `role="alert"`.
- Never announce high-frequency updates; poll results update the view silently, only the connection
  banner speaks.

## Colour and contrast

- Body text meets 4.5:1, large text and meaningful non-text elements meet 3:1, in **both** themes.
- Meaning is never carried by colour alone. Pair every status colour with text and an icon — a quality
  gate says "Passed" with a tick, not just green.
- Check both `:root` and `[data-theme='light']`; a token that passes in dark can fail in light.

## Charts

A chart is an image to assistive technology. Every one needs:

- `role="img"` with an `aria-label` summarising what it shows and its headline figures.
- A visually hidden `<table>` carrying the same data, with a caption.

Both are provided by the shared `Chart` component — supply real content for them, not a placeholder.

## Motion

Respect `prefers-reduced-motion` in CSS **and** JavaScript. The live commit stream checks it and
reveals the whole timeline at once instead of animating.

## Forms

- Every input has a visible, associated `<label>`. Placeholder text is not a label.
- Validation errors are announced, reference the field, and say how to fix it.

## WCAG 2.2 additions

These criteria are new in 2.2 and are easy to miss:

- **2.4.11 Focus Not Obscured (Minimum)** — a focused element must not be hidden behind a sticky
  header, a popover, or a banner. Check the header and the date-range popover.
- **2.4.13 Focus Appearance** — the focus indicator must be at least a 2 CSS px thick perimeter and
  meet 3:1 contrast against both the focused and unfocused state. `.focus-ring` provides this; do not
  override `outline` away from it.
- **2.5.7 Dragging Movements** — anything draggable needs a single-pointer alternative. Chart brush
  and zoom interactions need keyboard/button equivalents.
- **2.5.8 Target Size (Minimum)** — interactive targets are at least 24×24 CSS px, or spaced so the
  24 px circle around them does not overlap another target. Watch icon-only header buttons and
  drill-down rows.
- **3.2.6 Consistent Help** and **3.3.7 Redundant Entry** — help affordances stay in the same relative
  order across views, and the user is never asked to re-enter information the app already has.

## Checking

Assert accessibility in tests rather than by eye: query by role and accessible name
(`getByRole('button', { name: 'Apply custom range' })`) so a regression in naming fails the build.
For a fuller sweep, use the
[web-accessibility-audit skill](../skills/web-accessibility-audit/SKILL.md) — automated checks alone
find a minority of issues, so manual keyboard and screen-reader checks are not optional.
