import { APP_FAMILIES, getAppPalette, getMotionDuration } from './palette.js'

const setToken = (key, value) =>
  document.documentElement.style.setProperty(key, value)

describe('#getAppPalette', () => {
  test('Should read the app tokens, families and categorical palette', () => {
    setToken('--app-colour-text', '#0b0c0c')
    setToken('--app-colour-copilot', '#4c2c92')
    setToken('--app-colour-human', '#d9621a')
    setToken('--app-colour-assist', '#28a197')
    setToken('--app-colour-assist-ink', '#0b6e65')
    setToken('--app-colour-assist-tint', '#e5f5f3')
    setToken('--app-chart-1', '#12436d')

    const palette = getAppPalette()

    expect(palette.text).toBe('#0b0c0c')
    expect(palette.copilot).toBe('#4c2c92')
    expect(palette.human).toBe('#d9621a')
    expect(palette.family.assist).toStrictEqual({
      band: '#28a197',
      ink: '#0b6e65',
      tint: '#e5f5f3'
    })
    expect(palette.categorical).toHaveLength(6)
    expect(palette.categorical[0]).toBe('#12436d')
    expect(Object.keys(palette.family)).toStrictEqual(APP_FAMILIES)
    expect(palette.font).toMatch(/^Arial/)
  })
})

describe('#getMotionDuration', () => {
  test('Should read the motion duration token in milliseconds', () => {
    setToken('--app-motion-duration', '240ms')

    expect(getMotionDuration()).toBe(240)
  })

  test('Should be 0 when the token is missing', () => {
    document.documentElement.style.removeProperty('--app-motion-duration')

    expect(getMotionDuration()).toBe(0)
  })
})
