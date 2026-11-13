/**
 * Shared ECharts styling from docs/design-system.md §11: Arial, light
 * gridlines, horizontal axis text, token tooltips and decal patterns.
 */

export const CHART_FONT = 'Arial, Helvetica, sans-serif'
const FONT_SIZE = 14
const BYTE = 0xff
const RED_SHIFT = 16
const GREEN_SHIFT = 8
const DECAL_ALPHA = 0.6
const ZOOM_FILL_ALPHA = 0.15
const TOOLTIP_PADDING = { y: 8, x: 12 }
// Dash and gap lengths for the decal patterns, in pixels.
const DASH = { short: 2, mid: 3, base: 4, long: 5, wide: 6 }
// π/4: diagonal hatching.
const EIGHTH_TURN = Math.atan(1)

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Tooltip formatters return HTML, so payload strings are escaped first. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

/** `#rrggbb` or `rgb()` token value with an alpha channel. */
export function withAlpha(colour, alpha) {
  const hex = /^#([\da-f]{6})$/i.exec(colour ?? '')
  if (hex) {
    const n = Number.parseInt(hex[1], 16)
    return `rgba(${(n >> RED_SHIFT) & BYTE}, ${(n >> GREEN_SHIFT) & BYTE}, ${n & BYTE}, ${alpha})`
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(colour ?? '')
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((part) => part.trim())
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return colour
}

const DECAL_SHAPES = [
  null,
  {
    dashArrayX: [1, 0],
    dashArrayY: [DASH.mid, DASH.base],
    rotation: -EIGHTH_TURN
  },
  {
    symbol: 'circle',
    symbolSize: DECAL_ALPHA,
    dashArrayX: [DASH.base, DASH.base],
    dashArrayY: [DASH.base, DASH.base]
  },
  {
    dashArrayX: [1, 0],
    dashArrayY: [DASH.short, DASH.long],
    rotation: EIGHTH_TURN
  },
  { dashArrayX: [1, 0], dashArrayY: [DASH.short, DASH.base], rotation: 0 },
  {
    dashArrayX: [[DASH.wide, DASH.mid]],
    dashArrayY: [DASH.short, DASH.long],
    rotation: Math.PI / 2
  }
]

/** Pattern for the n-th series; index 0 stays solid. Human work uses the hatch (1). */
export function decal(p, index = 1) {
  const shape = DECAL_SHAPES[index % DECAL_SHAPES.length]
  if (!shape) {
    return undefined
  }
  return { symbol: 'rect', color: withAlpha(p.white, DECAL_ALPHA), ...shape }
}

export const LINE_TYPES = [
  'solid',
  'dashed',
  'dotted',
  [DASH.long + DASH.mid, DASH.base, DASH.short, DASH.base]
]
export const SYMBOLS = ['circle', 'diamond', 'triangle', 'rect', 'roundRect']

export function textStyle(p, extra = {}) {
  return {
    color: p.text,
    fontFamily: CHART_FONT,
    fontSize: FONT_SIZE,
    ...extra
  }
}

export function tooltip(p, extra = {}) {
  return {
    backgroundColor: p.white,
    borderColor: p.grid,
    borderWidth: 1,
    padding: [TOOLTIP_PADDING.y, TOOLTIP_PADDING.x],
    textStyle: textStyle(p),
    extraCssText:
      'box-shadow: var(--app-shadow); border-radius: var(--app-radius-s);',
    ...extra
  }
}

const legendItems = (p) => ({
  itemWidth: 16,
  itemHeight: 12,
  itemGap: 20,
  textStyle: textStyle(p)
})

export function legend(p, extra = {}) {
  return { top: 0, right: 0, ...legendItems(p), ...extra }
}

/** Legend centred under the chart, for round charts. */
export function bottomLegend(p, extra = {}) {
  return { bottom: 0, left: 'center', ...legendItems(p), ...extra }
}

export function categoryAxis(p, data, extra = {}) {
  return {
    type: 'category',
    data,
    axisLine: { lineStyle: { color: p.grid } },
    axisTick: { show: false },
    axisLabel: textStyle(p, { rotate: 0, hideOverlap: true }),
    ...extra
  }
}

export function valueAxis(p, name, extra = {}) {
  return {
    type: 'value',
    name,
    nameLocation: 'end',
    nameTextStyle: textStyle(p, { color: p.muted, align: 'left' }),
    axisLine: { show: false },
    axisLabel: textStyle(p, { color: p.muted }),
    splitLine: { lineStyle: { color: p.grid } },
    ...extra
  }
}

// Above BAR_LABEL_LIMIT bars the value labels collide; above BAR_WINDOW the bars scroll.
export const BAR_LABEL_LIMIT = 12
export const BAR_WINDOW = 30
const SLIDER_SIZE = 20

/** Per-bar value labels only while they fit; hover still shows each value. */
export function barLabels(p, count, label = {}) {
  return {
    label: textStyle(p, { show: count <= BAR_LABEL_LIMIT, ...label }),
    labelLayout: { hideOverlap: true }
  }
}

/**
 * A slider over a long category axis showing BAR_WINDOW bars at a time.
 * Always returned (hidden when not needed) so a merged setOption resets it.
 */
export function categoryZoom(p, count, { axis = 'x', anchor = 'start' } = {}) {
  const dense = count > BAR_WINDOW
  const span = dense ? (BAR_WINDOW / count) * 100 : 100
  const start = anchor === 'end' ? 100 - span : 0
  const placement =
    axis === 'x'
      ? { xAxisIndex: 0, bottom: 8, height: SLIDER_SIZE }
      : { yAxisIndex: 0, orient: 'vertical', right: 8, width: SLIDER_SIZE }
  return {
    dense,
    gap: dense ? SLIDER_SIZE + 24 : 0,
    dataZoom: [
      {
        type: 'slider',
        ...placement,
        show: dense,
        start,
        end: start + span,
        showDetail: false,
        brushSelect: false,
        borderColor: p.grid,
        fillerColor: withAlpha(p.brand, ZOOM_FILL_ALPHA),
        handleStyle: { color: p.white, borderColor: p.muted },
        moveHandleStyle: { color: p.muted },
        dataBackground: {
          lineStyle: { color: p.grid },
          areaStyle: { color: withAlpha(p.muted, ZOOM_FILL_ALPHA) }
        }
      }
    ]
  }
}
