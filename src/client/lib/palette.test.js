import { getPalette, deltaColor } from './palette.js'

const setToken = (key, value) =>
  document.documentElement.style.setProperty(key, value)

describe('#getPalette', () => {
  test('Should read every semantic token from the document root', () => {
    setToken('--color-primary', '#3b82f6')

    expect(getPalette().primary).toBe('#3b82f6')
  })

  test('Should expose the categorical, sequential, diverging and heat scales', () => {
    const palette = getPalette()

    expect(palette.categorical).toHaveLength(10)
    expect(palette.sequential).toHaveLength(5)
    expect(palette.diverging).toHaveLength(3)
    expect(palette.heat).toHaveLength(5)
  })

  test('Should convert oklch tokens to rgb, which ECharts can interpolate', () => {
    setToken('--color-copilot', 'oklch(0.5 0 0)')

    expect(getPalette().copilot).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  test('Should preserve alpha when converting oklch', () => {
    setToken('--color-copilot', 'oklch(0.5 0 0 / 0.5)')

    expect(getPalette().copilot).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/)
  })

  test('Should accept a percentage lightness', () => {
    setToken('--color-copilot', 'oklch(50% 0 0)')

    expect(getPalette().copilot).toMatch(/^rgb\(/)
  })

  test('Should pass non-oklch values through unchanged', () => {
    setToken('--color-manual', '#64748b')

    expect(getPalette().manual).toBe('#64748b')
  })

  test('Should return an empty string for a token that is not defined', () => {
    setToken('--color-manual', '')

    expect(getPalette().manual).toBe('')
  })
})

describe('#deltaColor', () => {
  const palette = { diverging: ['negative', 'neutral', 'positive'] }

  test('Should use the positive end of the scale for a gain', () => {
    expect(deltaColor(10, palette)).toBe('positive')
  })

  test('Should use the negative end of the scale for a loss', () => {
    expect(deltaColor(-10, palette)).toBe('negative')
  })

  test('Should use the midpoint for no change', () => {
    expect(deltaColor(0, palette)).toBe('neutral')
  })
})
