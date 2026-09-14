---
name: analytics-dashboard
description: 'Build or extend a dashboard view, chart, or KPI — selecting the right visual, deriving the metric, wiring it into a view, and giving it token-driven colour, animation, and an accessible alternative. Use when adding a metric, adding or restyling a chart, adding a drill-down, or changing dashboard layout. Do NOT use for server routes, the proxy, or ingest — use the bff-proxy skill.'
---

# Skill: Build or Extend a Dashboard View

Follow `.github/instructions/dashboard-charts.instructions.md`, `react.instructions.md`,
`styling.instructions.md`, `accessibility.instructions.md`, and `testing.instructions.md`.

## 1. Clarify the intent

Before coding, confirm:

1. Which metric, and what story it tells ("cycle time fell after Copilot adoption").
2. Whether the underlying data already exists in the payload, or the backend contract must change.
3. Which chart type fits — use the decision table in the charting instructions.
4. Where it sits: the overview, a repository, a pull request, or a contributor view.
5. Whether it is a drill-down target, and what the breadcrumb should say.

If the payload does not carry the data, stop. That is a backend contract change and must be agreed in
`mmo-cr-copilot-backend` first.

## 2. Derive the metric in a selector

All metric maths lives in `src/client/lib/selectors.js`, never in a component. Selectors are pure
functions over the payload array, which is what makes them testable and reusable across views.

- Reuse `computePrMetrics` rather than re-deriving per-PR figures.
- Exclude rebase and merge commits — `effectiveClassification` already reclassifies them, and every
  rate, rework, and leverage figure must ignore them.
- Guard partial data with `isPlottableCommit` / `isPlottablePayload`; the dashboard must never plot
  `NaN`.
- Round through the shared `round` / `rate` helpers so figures are consistent across panels.

Write the selector's tests first — they are cheap and they pin the maths.

## 3. Reuse a chart before adding one

Check `src/client/components/charts` for an existing component. A new one is justified only by a
genuinely new visual, not a new dataset.

If it is new:

1. Register the chart type in `src/client/lib/echarts.js`.
2. Compose `Chart` and `Panel`. Do not create a second ECharts wrapper.
3. Build the `option` in a `useMemo` keyed on the data **and** `theme`.
4. Take every colour from `getPalette()`.
5. Provide an `ariaLabel` summary and a real `dataTable`.

## 4. Wire it into the view

- Derive selector output once in the view with `useMemo`, then pass it down. Do not call a selector
  per chart.
- Pass drill-down handlers down as props (`onOpenRepo`, `onOpenPR`, `onOpenContributor`). A view never
  sets navigation state itself.
- If the chart offers a drill-down through `onSelect`, provide a keyboard-reachable equivalent too.
- For a new drill-down level, add the `nav` level in `App.jsx`, its breadcrumb entry, and its heading.

## 5. Handle every state

`Panel` takes `loading`, `empty`, `error`, or `populated`. Note that `empty` and `error` render their
own message and **ignore children**.

Decide explicitly what the panel shows when there is no data in the window, when the feed is
reconnecting, and when an optional integration is off. "It renders the happy path" is not done.

## 6. Test

- Selector: the maths, the empty case, partial data, and rebase exclusion.
- Chart: the ECharts option it produces — series types, axis data, colours — via
  `test-helpers/charts.js`.
- View: that the metric appears, that a drill-down handler fires, and that it survives an empty
  payload set.
- Mock `/api/sonar` explicitly when rendering a view; its panels crash on an unexpected shape.

## Definition of Done

`npm run build:frontend`, `npm run lint`, `npm run format:check`, and `npm test` pass; every panel
renders all four states; colours come from tokens and re-theme correctly; the chart has an accessible
label and data table; no `ResizeObserver`, timer, or request leaks; reduced motion is honoured. Then
**iterate with the user** until the visual matches what they expected.
