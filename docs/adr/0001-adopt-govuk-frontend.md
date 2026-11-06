# 0001. Adopt GOV.UK Frontend and MOJ Frontend in the React SPA

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The dashboard UI is built with Tailwind CSS v4 and its own design tokens, with light and dark themes.
It should look and behave like a government service, with charts following cross-government
data-visualisation guidance, without losing any existing view, chart, action or behaviour.

Findings that shape the decision:

- The GOV.UK Design System has no dashboard pattern. The UKHSA data dashboard is the best
  cross-government reference: GOV.UK Frontend shell, topic navigation, and a chart, table and
  download per metric.
- The MOJ Design System is GOV.UK-compatible and provides the missing pieces: organisation switcher,
  numeric data, sortable table, filter, sub and side navigation, badge, card, timeline and API error.
- Government Analysis Function chart guidance: title and subtitle in the page, a text description
  and/or data table alternative, a download per chart, no dual axes, at most four lines per line
  chart, direct labels instead of legends, horizontal text, pie or donut only for five or fewer
  categories, and the accessible AF palette.
- GDS Transport and the GOV.UK crown are only for services on GOV.UK domains.
- The GOV.UK page template adds the `govuk-frontend-supported` class with an inline script. This
  service's CSP forbids inline script.
- GOV.UK Frontend ships no React components, and its JavaScript mutates the DOM.
- GOV.UK Frontend has no dark theme.

**Decided:** dark mode is out of scope for this revamp and will be planned separately.

## Decision

**Accepted in E1-S2.**

- Use **GOV.UK Frontend** for the page shell and components, and **MOJ Frontend** for dashboard
  patterns, compiled through Vite. Versions are pinned exactly (no `^`).
- React renders GOV.UK and MOJ markup and classes. Interactive behaviour (tabs, accordion) is
  implemented in React using the documented markup and ARIA, rather than letting GOV.UK JavaScript
  change React-owned DOM.
- Set `js-enabled govuk-frontend-supported` from the bundled module, not an inline script, so
  `script-src` stays `'self'`.
- Use **Arial** (Helvetica fallback) and a Defra-appropriate header unless the service is hosted on a
  GOV.UK domain.
- Restyle charts to Analysis Function guidance, mapping the AF palette into `lib/palette.js`. ECharts
  stays.
- Remove the light and dark theme switch (decision D2).
- Remove Tailwind for UI chrome, with no parallel token system. Tailwind is legacy and is removed by
  E1-S12; no new Tailwind is written.

## Consequences

- Views are migrated one at a time, each closing with a feature-parity check.
- Some charts change form where AF guidance advises against them (for example gauge to numeric
  tile); the information is kept.
- When accepted, the "not a GOV.UK Design System service" statements in `.github/copilot-instructions.md`
  and `AGENTS.md`, and the styling, accessibility and dashboard-charts instruction files, must be
  updated to match.
- A Sass pipeline is added; Tailwind and its tokens are retired.

## Alternatives considered

- **Keep Tailwind with a GOV.UK-like theme** — a look-alike without the tested components and
  accessibility of the Design System.
- **A third-party React port of GOV.UK Frontend** — not maintained by GDS and lags releases.
- **Use GOV.UK Frontend JavaScript directly** — conflicts with React owning the DOM.

## Resolution of open points

- **Domain, font and crown:** not on a GOV.UK domain. Arial (Helvetica fallback), no GDS
  Transport, no crown. Header, footer, logo and favicon are the Defra ones required by the
  [Defra digital service manual](https://digital.defra.gov.uk/design/branding), not GOV.UK
  components (backlog D13, October 2026). GOV.UK Frontend components are still used for page
  content and the service navigation. Deliberate deviation (BUG-21): the header service name uses
  the MOJ header service-name typography (24px bold, text colour) so it sits with the MOJ patterns
  used elsewhere; the Defra logo, footer and favicon are unchanged.
- **Sass pipeline:** compiled by Vite with Sass `NodePackageImporter`, so `pkg:` imports resolve
  `govuk-frontend` and `@ministryofjustice/frontend`; output and assets are served under `/public`.
- **JavaScript:** no GOV.UK or MOJ JavaScript is loaded; behaviour is implemented in React.
- **CSP:** `js-enabled govuk-frontend-supported` are set on `<body>` from the bundle, so the CSP is
  unchanged and `script-src` stays `'self'`.
- **Layout:** page width is 1340px (`$moj-page-width`).
- **Tailwind:** none survives; the strangler is removed in E1-S12.
- **Dark mode:** dropped (D2). Remaining dark CSS tokens are deleted with Tailwind in E1-S12.
- **Tokens, header, phase banner and AF palette:** governed by
  [docs/design-system.md](../design-system.md).

## References

- GOV.UK Design System — https://design-system.service.gov.uk/
- GOV.UK Frontend — https://frontend.design-system.service.gov.uk/
- GOV.UK typography (font use) — https://design-system.service.gov.uk/styles/typography/
- MOJ Design System components — https://design-patterns.service.justice.gov.uk/components/
- Analysis Function, data visualisation: charts —
  https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts/
- UKHSA data dashboard — https://ukhsa-dashboard.data.gov.uk/
- WCAG 2.2 — https://www.w3.org/TR/WCAG22/
