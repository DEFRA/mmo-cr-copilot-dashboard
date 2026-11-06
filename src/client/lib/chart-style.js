/**
 * Shared ECharts styling from docs/design-system.md §11: Arial, light
 * gridlines, horizontal axis text, token tooltips and decal patterns.
 */

export const CHART_FONT = 'Arial, Helvetica, sans-serif'
const FONT_SIZE = 14

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
    const n = parseInt(hex[1], 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
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
  { dashArrayX: [1, 0], dashArrayY: [3, 4], rotation: -Math.PI / 4 },
  { symbol: 'circle', symbolSize: 0.6, dashArrayX: [4, 4], dashArrayY: [4, 4] },
  { dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: Math.PI / 4 },
  { dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: 0 },
  { dashArrayX: [[6, 3]], dashArrayY: [2, 5], rotation: Math.PI / 2 }
]

/** Pattern for the n-th series; index 0 stays solid. Human work uses the hatch (1). */
export function decal(p, index = 1) {
  const shape = DECAL_SHAPES[index % DECAL_SHAPES.length]
  if (!shape) return undefined
  return { symbol: 'rect', color: withAlpha(p.white, 0.6), ...shape }
}

export const LINE_TYPES = ['solid', 'dashed', 'dotted', [8, 4, 2, 4]]
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
    padding: [8, 12],
    textStyle: textStyle(p),
    extraCssText:
      'box-shadow: var(--app-shadow); border-radius: var(--app-radius-s);',
    ...extra
  }
}

export function legend(p, extra = {}) {
  return {
    top: 0,
    right: 0,
    itemWidth: 16,
    itemHeight: 12,
    itemGap: 20,
    textStyle: textStyle(p),
    ...extra
  }
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
        fillerColor: withAlpha(p.brand, 0.15),
        handleStyle: { color: p.white, borderColor: p.muted },
        moveHandleStyle: { color: p.muted },
        dataBackground: {
          lineStyle: { color: p.grid },
          areaStyle: { color: withAlpha(p.muted, 0.15) }
        }
      }
    ]
  }
}
