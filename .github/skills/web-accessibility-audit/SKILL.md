---
name: web-accessibility-audit
description: 'Audit and validate the MMO Copilot analytics dashboard against WCAG 2.2 level AA — semantic structure, accessible names, keyboard operation, focus visibility, colour contrast in both light and dark themes, chart alternatives, live regions and reduced motion. Use when a UI change lands, before a release, or when an accessibility defect is reported. Produces prioritised findings with the failing success criterion and a concrete fix.'
argument-hint: "e.g. 'audit the Settings page' or 'check the persona insight cards meet AA in dark theme'"
user-invocable: false
---

# Web accessibility audit (WCAG 2.2 AA)

Accessibility is a **legal requirement**, not a polish item. This dashboard must meet **WCAG 2.2
level AA** and work with common assistive technologies, per the mandatory DEFRA constraints in
[copilot-instructions.md](../../copilot-instructions.md) §2 and the
[accessibility instructions](../../instructions/accessibility.instructions.md).

This service is **not** a GOV.UK Design System service, so there are no GDS component defaults to
inherit accessibility from. Every control and every chart has to earn it explicitly.

## When to use

- Any change that adds or alters a view, component, chart, panel, control or token.
- Before a release, as a sweep across the affected views.
- When an accessibility defect is reported and needs to be reproduced and scoped.

## Procedure

1. **Scope it.** List the views/components in scope and the states each one can be in (loading,
   empty, error, populated; light and dark theme; narrow and wide viewport).
2. **Run the app** (`npm run dev`, `http://localhost:3000`) and walk each view in each state.
3. **Work the checklist** below in order. Record each failure with the **exact success criterion**
   (e.g. `1.4.3 Contrast (Minimum)`), the element, the state it occurs in, and a concrete fix.
4. **Check the tests.** Accessibility-relevant markup (accessible names, roles, live regions, table
   alternatives) should be asserted in the component tests — a fix without a test will regress.
5. **Report** using the output format below, prioritised so blocking failures are unambiguous.
6. **Stop the dev server** when finished.

## Checklist

### Structure and semantics

- [ ] One `h1` per view; headings are ordered with no skipped levels.
- [ ] Landmarks are correct (`header`, `main`, `nav`, `section` with an accessible name).
- [ ] Lists, tables and groups use real semantic elements — a table of data is a `<table>` with
      `<th scope>`, never a grid of `<div>`s.
- [ ] Decorative visuals (icons, accents, glyphs) are `aria-hidden="true"` and never the only carrier
      of meaning.

### Names, roles and values

- [ ] Every interactive control has an accessible name that describes its **destination or effect**
      (`Switch to light theme`, `Open settings`), not just its icon.
- [ ] Every form control has a programmatically associated `<label>`; placeholders are never used as
      labels.
- [ ] Buttons are `<button>` and links are `<a>` — never a clickable `<div>`.
- [ ] State is exposed (`aria-expanded`, `aria-current`, `aria-pressed`) wherever the UI conveys it
      visually.

### Keyboard and focus

- [ ] Every interactive element is reachable and operable by keyboard, in a logical tab order.
- [ ] Focus is **always visible**, meets 3:1 contrast, and is never hidden behind a sticky header or
      popover (2.4.11 Focus Not Obscured, 2.4.13 Focus Appearance).
- [ ] No keyboard trap. Popovers/dialogs close on `Escape` and return focus to their trigger.
- [ ] Drill-down navigation is operable without a mouse, and the breadcrumb offers a way back.
- [ ] No control depends on hover or a drag gesture alone (`2.5.7 Dragging Movements`,
      `2.5.8 Target Size (Minimum)` — 24×24 CSS px minimum).

### Colour and contrast

- [ ] Text meets **4.5:1** (normal) / **3:1** (large); UI components and graphical objects meet
      **3:1** — verified in **both light and dark themes**.
- [ ] **No meaning is carried by colour alone.** Status, classification and series are also encoded
      by text, icon, shape or pattern.
- [ ] Chart series remain distinguishable for common colour-vision deficiencies.
- [ ] All colour comes from `@theme` tokens via `lib/palette.js` — a raw hex bypasses the themed
      contrast guarantees and is a finding in its own right.

### Charts and data visualisation

- [ ] Every chart has an **accessible name** describing what it shows.
- [ ] Every chart has a **data-table alternative** exposing the same values to a screen reader.
- [ ] The chart container is not an unlabelled canvas black box; ECharts internals are `aria-hidden`
      where they would otherwise be announced as noise.
- [ ] Tooltips are not the only route to a value.

### Dynamic content and status

- [ ] Connection state, polling updates and error banners are announced with an appropriate live
      region (`role="status"` / `aria-live="polite"`) — and are **not** over-announced on every poll.
- [ ] Loading, empty and error states are perceivable as text, not by a spinner or colour alone.
- [ ] An error state offers a route to recovery and never exposes internal detail.

### Motion and preferences

- [ ] Animation respects `prefers-reduced-motion`; nothing auto-plays for more than 5 seconds without
      a pause control.
- [ ] The layout holds and stays operable at 200% zoom and at a 320 CSS px width (`1.4.10 Reflow`).
- [ ] Content is not lost or clipped at 200% text spacing (`1.4.12 Text Spacing`).

## Severity

- **Blocking** — a WCAG 2.2 AA failure. It is a legal compliance failure; it must be fixed before
  merge.
- **Recommended** — degrades the experience for assistive-technology users without failing a success
  criterion.
- **Nit** — a minor improvement.

## Output format

For each finding:

1. File/component and the state it occurs in (view, theme, viewport).
2. The **WCAG 2.2 success criterion** it fails, by number and name.
3. What a user experiences as a result.
4. A concrete fix (a code snippet where it helps) and the test that should lock it in.

End with a summary: total findings by severity, which views/states were covered, which were not, and
a clear verdict on whether the change meets WCAG 2.2 AA.

## Guardrails

- An automated checker finds a minority of issues. **Manual keyboard and screen-reader checks are not
  optional** — never report a pass on automated output alone.
- Never weaken a security control (CSP, escaping) to satisfy an accessibility finding; both are
  mandatory and a conflict means the design is wrong.
- This skill audits and recommends; it does not edit code.

## References

- [accessibility instructions](../../instructions/accessibility.instructions.md) ·
  [styling instructions](../../instructions/styling.instructions.md) ·
  [charts instructions](../../instructions/dashboard-charts.instructions.md)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) ·
  [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) ·
  [GOV.UK Service Manual — accessibility](https://www.gov.uk/service-manual/helping-people-to-use-your-service)
- [DEFRA software development standards](https://defra.github.io/software-development-standards/)
