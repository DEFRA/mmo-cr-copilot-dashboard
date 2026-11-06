/**
 * Access to the ECharts options captured by the renderer stub installed in
 * `.vite/setup-client.js`. Charts are asserted on the option they produce
 * rather than on a canvas jsdom cannot draw.
 */

export function chartOptions() {
  return globalThis.__chartOptions ?? []
}

/** The option for the most recently rendered chart. */
export function lastChartOption() {
  const options = chartOptions()
  return options[options.length - 1]
}

/** Flattens every series across every chart rendered so far. */
export function allSeries() {
  return chartOptions().flatMap((option) => option?.series ?? [])
}

/** The `onEvents` handlers of the last chart rendered with a series of `type`. */
export function chartEventsFor(type) {
  const options = chartOptions()
  const index = options.findLastIndex((option) =>
    option?.series?.some((s) => s.type === type)
  )
  return index < 0 ? undefined : globalThis.__chartEvents[index]
}
