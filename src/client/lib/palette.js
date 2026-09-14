/**
 * Reads design-token custom properties from the document root into JS colour
 * values usable by ECharts. Recomputed whenever the theme changes so charts
 * always match the active palette.
 */

const TOKEN_KEYS = {
  text: '--color-text',
  textMuted: '--color-text-muted',
  textFaint: '--color-text-faint',
  border: '--color-border',
  borderStrong: '--color-border-strong',
  surface: '--color-surface',
  surface2: '--color-surface-2',
  primary: '--color-primary',
  accent: '--color-accent',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  info: '--color-info',
  copilot: '--color-copilot',
  manual: '--color-manual',
  gaugeNeedle: '--gauge-needle',
  statusFast: '--status-fast',
  statusSlow: '--status-slow'
}

const CATEGORICAL_KEYS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--chart-7',
  '--chart-8',
  '--chart-9',
  '--chart-10'
]

const SEQUENTIAL_KEYS = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5']
const DIVERGING_KEYS = ['--div-neg', '--div-mid', '--div-pos']
const HEAT_KEYS = ['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5']

/**
 * Converts an `oklch(L C H[/a])` string to an sRGB `rgb()/rgba()` string.
 * ECharts parses colours in JS for gradient/visualMap interpolation and cannot
 * read oklch(); browsers also preserve oklch() through getComputedStyle and
 * canvas fillStyle, so we do the colour-space maths ourselves. Non-oklch values
 * pass through unchanged.
 */
function oklchToRgb(value) {
  const match =
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/i.exec(
      value
    )
  if (!match) return value

  let L = parseFloat(match[1])
  if (match[1].endsWith('%')) L /= 100
  const C = parseFloat(match[2])
  const H = (parseFloat(match[3]) * Math.PI) / 180
  let alpha = 1
  if (match[4] != null) {
    alpha = parseFloat(match[4])
    if (match[4].endsWith('%')) alpha /= 100
  }

  const a = C * Math.cos(H)
  const b = C * Math.sin(H)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]

  const toGamma = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.min(255, Math.max(0, Math.round(v * 255)))
  }

  const [r, g, bl] = lin.map(toGamma)
  return alpha < 1
    ? `rgba(${r}, ${g}, ${bl}, ${alpha})`
    : `rgb(${r}, ${g}, ${bl})`
}

function read(key) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(key)
    .trim()
  return oklchToRgb(raw)
}

export function getPalette() {
  const tokens = Object.fromEntries(
    Object.entries(TOKEN_KEYS).map(([name, key]) => [name, read(key)])
  )
  return {
    ...tokens,
    categorical: CATEGORICAL_KEYS.map(read),
    sequential: SEQUENTIAL_KEYS.map(read),
    diverging: DIVERGING_KEYS.map(read),
    heat: HEAT_KEYS.map(read),
    heatInk: read('--heat-ink')
  }
}

/** Colour for a net-line delta: positive = pos scale, negative = neg scale. */
export function deltaColor(value, palette) {
  if (value > 0) return palette.diverging[2]
  if (value < 0) return palette.diverging[0]
  return palette.diverging[1]
}
