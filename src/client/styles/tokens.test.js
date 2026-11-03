import { readFileSync } from 'node:fs'

const SOURCE = readFileSync('src/client/styles/_tokens.scss', 'utf8')
const TOKENS = Object.fromEntries(
  [...SOURCE.matchAll(/(--app-[\w-]+):\s*(#[0-9a-f]{6});/gi)].map(
    ([, name, hex]) => [name, hex]
  )
)
const FAMILIES = [
  'adoption',
  'assist',
  'quality',
  'speed',
  'leverage',
  'risk',
  'output'
]

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a
  )
  return (light + 0.05) / (dark + 0.05)
}

const WHITE = '#ffffff'

describe('#design tokens', () => {
  test.each(FAMILIES)('Should give %s ink at least 4.5:1 on its tint', (f) => {
    const ink = TOKENS[`--app-colour-${f}-ink`]
    const tint = TOKENS[`--app-colour-${f}-tint`]

    expect(contrast(ink, tint)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(ink, WHITE)).toBeGreaterThanOrEqual(4.5)
  })

  test.each(FAMILIES)('Should give the %s band 3:1 against white', (f) => {
    expect(contrast(TOKENS[`--app-colour-${f}`], WHITE)).toBeGreaterThanOrEqual(
      3
    )
  })

  test('Should keep text readable on the canvas and white on brand', () => {
    const canvas = TOKENS['--app-colour-canvas']

    expect(contrast(TOKENS['--app-colour-text'], canvas)).toBeGreaterThan(4.5)
    expect(
      contrast(TOKENS['--app-colour-text-muted'], canvas)
    ).toBeGreaterThanOrEqual(4.5)
    expect(contrast(WHITE, TOKENS['--app-colour-brand'])).toBeGreaterThan(4.5)
    expect(
      contrast(
        TOKENS['--app-colour-brand-ink'],
        TOKENS['--app-colour-brand-tint']
      )
    ).toBeGreaterThanOrEqual(4.5)
  })

  test('Should keep error ink readable on the error tint', () => {
    expect(
      contrast(
        TOKENS['--app-colour-error-ink'],
        TOKENS['--app-colour-error-tint']
      )
    ).toBeGreaterThanOrEqual(4.5)
  })

  test.each([
    ['--app-size-xs', '--app-colour-white'],
    ['--app-size-s', '--app-colour-text'],
    ['--app-size-m', '--app-colour-text'],
    ['--app-size-l', '--app-colour-text'],
    ['--app-size-xl', '--app-colour-white'],
    ['--app-rating-a', '--app-colour-white'],
    ['--app-rating-b', '--app-colour-text'],
    ['--app-rating-c', '--app-colour-text'],
    ['--app-rating-d', '--app-colour-text'],
    ['--app-rating-e', '--app-colour-white']
  ])('Should give %s readable %s text', (fill, text) => {
    expect(contrast(TOKENS[text], TOKENS[fill])).toBeGreaterThanOrEqual(4.5)
  })

  test('Should give the focus colour 3:1 against text', () => {
    expect(
      contrast(TOKENS['--app-colour-focus'], TOKENS['--app-colour-text'])
    ).toBeGreaterThanOrEqual(3)
  })
})
