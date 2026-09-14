---
description: 'Apache ECharts charting rules for the dashboard: the lean registry, choosing a chart type, building options, token-driven colour, animation, accessible alternatives, and dashboard layout. Use when adding or changing a chart, a KPI, or a dashboard view.'
applyTo: 'src/client/components/**/*.jsx'
---

# Dashboard & Charting Rules — Apache ECharts

## The registry

ECharts is imported lean through `src/client/lib/echarts.js`, which registers only the charts,
components, and the canvas renderer actually used. Never `import * as echarts from 'echarts'` — it
pulls in the entire library and roughly triples the bundle.

Adding a new chart type means registering it there first.

## Choosing a chart type

| Goal                                              | Use                                  |
| :------------------------------------------------ | :----------------------------------- |
| Headline number with a delta                      | `KpiCard`                            |
| Status against thresholds                         | `StatusGauge`                        |
| Compare categories                                | `CategoryBar`                        |
| Part-to-whole across categories                   | `StackedBar`                         |
| Trend over time                                   | `TrendLine`                          |
| Composition of a whole                            | `DistributionDonut`                  |
| Hierarchical composition                          | `BreakdownTreemap`                   |
| Correlation or hotspot (2–4 dimensions)           | `HotspotScatter`, `CycleTimeScatter` |
| Density across two categorical axes               | `ActivityHeatmap`                    |
| Compare entities as shapes across normalised axes | `ProfileRadar`                       |

Reuse an existing component before adding one. A new chart component is justified only by a genuinely
new visual, not by a new dataset.

## Building a chart component

Compose `Chart` (which owns the ECharts instance, resize handling, and the accessible container) with
`Panel` (which owns title, subtitle, action, and the four states).

- Accept data and configuration as props. Build the ECharts `option` inside a `useMemo` keyed on the
  data **and** the theme.
- Read every colour from `getPalette()`. Never a hardcoded hex.
- Convert OKLCH tokens through the palette — ECharts interpolates colours in JavaScript and cannot
  parse `oklch()`.
- Set entrance and update animation, and disable it under `prefers-reduced-motion`.
- Update through a merged `setOption` on the existing instance. Never remount a chart to refresh it.

## Accessibility

Every chart needs a non-visual equivalent:

- An `ariaLabel` summarising what the chart shows and its headline figures.
- A `dataTable` — a real `<table>` with a `<caption>` and scoped headers — rendered visually hidden.
  This is what a screen-reader user actually reads, so it must carry the same information.
- Status encoded by text **and** icon as well as colour. `SonarGate` renders "Quality gate: Passed",
  not a green dot.
- Any interactive chart element must have a keyboard-reachable equivalent; chart `onSelect` alone is
  mouse-only.

## Panel states

`Panel` takes `state` of `loading`, `empty`, `error`, or `populated`. Note that `empty` and `error`
render their own message and **ignore children** — pass the state you actually want rendered.

Every panel must have a defined appearance in all four states. A dashboard that renders only the happy
path is not finished.

## Layout

- Responsive CSS Grid, `auto-fit` with `minmax()`, mobile-up.
- KPI row first, then detail charts in a reading order that tells the delivery story.
- Lazy-load route-level views with `React.lazy` and show a skeleton while they load.
- Show the connection state and the last-updated time globally, not per panel.

## Performance

- Selectors over the payload set are expensive — memoise them, and derive once in the view rather than
  per chart.
- Keep rolling windows bounded; never grow an array without eviction.
- One `ResizeObserver` per chart, disposed on unmount. `Chart` already does this — do not add another.
