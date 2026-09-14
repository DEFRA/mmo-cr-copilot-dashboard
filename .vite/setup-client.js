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

  const EChartsStub = forwardRef(({ option }, ref) => {
    useImperativeHandle(ref, () => ({
      getEchartsInstance: () => ({ resize: () => {}, dispose: () => {} })
    }))

    globalThis.__chartOptions.push(option)

    return jsx('div', { 'data-testid': 'echart' })
  })

  EChartsStub.displayName = 'EChartsStub'

  return { default: EChartsStub }
})

/**
 * The palette is read from CSS custom properties, which jsdom will not resolve
 * from the Tailwind stylesheet. Seeding them keeps colour assertions meaningful
 * — without this every token reads as an empty string.
 */
function seedDesignTokens() {
  const tokens = {
    '--color-text': '#e6e8ee',
    '--color-text-muted': '#9aa3b2',
    '--color-text-faint': '#6b7280',
    '--color-border': '#2a2f3a',
    '--color-border-strong': '#3a4150',
    '--color-surface': '#12151c',
    '--color-surface-2': '#191d26',
    '--color-primary': '#3b82f6',
    '--color-accent': '#a855f7',
    '--color-success': '#22c55e',
    '--color-warning': '#f59e0b',
    '--color-danger': '#ef4444',
    '--color-info': '#06b6d4',
    '--color-copilot': '#7c3aed',
    '--color-manual': '#64748b',
    '--gauge-needle': '#e6e8ee',
    '--status-fast': '#22c55e',
    '--status-slow': '#ef4444',
    '--heat-ink': '#0b0d12'
  }

  const scales = {
    '--chart-': 10,
    '--seq-': 5,
    '--heat-': 5
  }

  for (const [prefix, count] of Object.entries(scales)) {
    for (let index = 1; index <= count; index++) {
      tokens[`${prefix}${index}`] =
        `#${(index * 111111).toString(16).padStart(6, '0').slice(-6)}`
    }
  }

  tokens['--div-neg'] = '#ef4444'
  tokens['--div-mid'] = '#9aa3b2'
  tokens['--div-pos'] = '#22c55e'

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
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  fetchMock.disableMocks()
})
