---
description: 'Tailwind CSS v4 and design-token styling rules for the dashboard: CSS-first theme configuration, token-only colour and spacing, when to extract a class, theming, responsive layout, and motion. Use when writing CSS or applying styles in JSX.'
applyTo: 'src/client/**/*.{jsx,css}'
---

# Styling Rules — Tailwind CSS v4 + Design Tokens

This is **not** a GOV.UK Design System service. There is no `govuk-frontend` and no GDS SCSS.

## Token-first: never hardcode a value

Colour, spacing, radius, shadow and type are defined once as tokens in the `@theme` layer of
`src/client/index.css`, then referenced everywhere.

```css
/* WRONG */
color: #2563eb;
padding: 24px;

/* CORRECT */
color: var(--color-primary);
padding: var(--space-6);
```

The same tokens feed the charts through `lib/palette.js`, so a hardcoded colour in a component
silently breaks theme switching and chart consistency at once.

## Tailwind v4 setup

- Configured in CSS with `@import "tailwindcss";` and `@theme`. There is **no** `tailwind.config.js`
  and none should be added.
- Theme values are exposed automatically as CSS custom properties.
- Use `@utility` for a custom utility and `@variant` for a custom variant, not legacy plugin config.
- Prefer **OKLCH** for colour — perceptually uniform and easy to derive tints from. `lib/palette.js`
  converts OKLCH to `rgb()` for ECharts, which cannot parse it.

## Utilities for layout, classes for repeated visuals

Use utilities for structure: `flex`, `grid`, `grid-cols-*`, `gap-*`, `p-*`, `w-*`, `relative`, `z-*`.

Extract a named class when:

- the same styled pattern repeats across components (`.panel`, `.kpi-card`, `.pill`);
- the styling is complex — gradients, layered shadows, keyframes;
- more than roughly eight visual utilities on one element hurt readability.

Name for intent (`.kpi-card`), never for appearance (`.blue-box`).

## Theming

Theme by overriding tokens under a scope selector; components only ever reference semantic tokens.

```css
:root {
  --color-surface: oklch(0.21 0.02 260);
}
[data-theme='light'] {
  --color-surface: oklch(0.98 0.01 260);
}
```

`useTheme` toggles `data-theme` on the document element. Any chart reading the palette must rebuild
its option when the theme changes — include `theme` in the `useMemo` dependencies.

## Inline styles

Inline `style` is acceptable only for a value computed at runtime from a token — an accent colour on a
KPI card, a status colour on a badge. Never for static styling that belongs in a class.

## Responsive and layout

- Mobile-up; add complexity at `sm` / `md` / `lg`.
- Prefer intrinsic layout: CSS Grid with `minmax()` and `auto-fit`, Flexbox with `gap`.
- Avoid fixed heights on content containers; let content define size. Charts are the exception — they
  take an explicit `height` prop because a canvas needs one.

## Motion

- Animate `transform` and `opacity`. Avoid animating `width`, `height`, `top`, or `left`.
- Guard animation behind `@media (prefers-reduced-motion: reduce)`, and check
  `matchMedia('(prefers-reduced-motion: reduce)')` in JavaScript-driven motion such as the live commit
  stream.

## Architecture

- Global reset, `@theme` tokens and base element styles stay in `src/client/index.css`.
- Keep specificity flat: no deep descendant selectors, no `!important`.
