import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, beforeAll, afterAll } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

const fetchMock = createFetchMock(vi)

/**
 * ECharts renders to a canvas, which jsdom does not implement. The renderer is
 * replaced with a stub that records the option each chart produces, so tests
 * can assert on what would be drawn instead of on pixels.
 */
vi.mock('echarts-for-react/esm/core', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  const { jsx } = await import('react/jsx-runtime')

  const EChartsStub = forwardRef(({ option, onEvents }, ref) => {
    useImperativeHandle(ref, () => ({
      getEchartsInstance: () => ({ resize: () => {}, dispose: () => {} })
    }))

    globalThis.__chartOptions.push(option)
    globalThis.__chartEvents.push(onEvents)

    return jsx('div', { 'data-testid': 'echart' })
  })

  EChartsStub.displayName = 'EChartsStub'

  return { default: EChartsStub }
})

/**
 * jsdom does not compile the Sass, so the `--app-*` tokens the palette reads
 * are seeded here; otherwise every token reads as an empty string.
 */
function seedDesignTokens() {
  const tokens = {
    '--app-colour-text': '#0b0c0c',
    '--app-colour-text-muted': '#505a5f',
    '--app-colour-line': '#d8e2ea',
    '--app-colour-white': '#ffffff',
    '--app-colour-neutral-tint': '#eef0f1',
    '--app-colour-brand': '#1d70b8',
    '--app-colour-error': '#d4351c',
    '--app-colour-copilot': '#4c2c92',
    '--app-colour-human': '#d9621a',
    '--app-size-l': '#f47738',
    '--app-motion-duration': '900ms'
  }
  const families = {
    adoption: ['#00703c', '#00703c', '#e6f2ec'],
    assist: ['#28a197', '#0b6e65', '#e5f5f3'],
    quality: ['#28a197', '#0b6e65', '#e5f5f3'],
    speed: ['#1d70b8', '#155a96', '#e8f1f8'],
    leverage: ['#4c2c92', '#4c2c92', '#eeeaf6'],
    risk: ['#d9621a', '#a8400f', '#fef0e8'],
    output: ['#d53880', '#b0246a', '#fbe9f1']
  }
  for (const [name, [band, ink, tint]] of Object.entries(families)) {
    tokens[`--app-colour-${name}`] = band
    tokens[`--app-colour-${name}-ink`] = ink
    tokens[`--app-colour-${name}-tint`] = tint
  }
  ;['#12436d', '#28a197', '#801650', '#f46a25', '#3d3d3d', '#a285d1'].forEach(
    (hex, index) => {
      tokens[`--app-chart-${index + 1}`] = hex
    }
  )

  for (const [key, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(key, value)
  }
}

beforeAll(() => {
  fetchMock.enableMocks()
  global.fetch = fetchMock
  global.fetchMock = fetchMock

  seedDesignTokens()

  // jsdom implements neither, and the chart components rely on both.
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  global.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false
  })
})

beforeEach(() => {
  globalThis.__chartOptions = []
  globalThis.__chartEvents = []
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  fetchMock.disableMocks()
})
