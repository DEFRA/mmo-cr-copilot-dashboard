import { render, screen } from '@testing-library/react'

import { chartOptions } from '#/test-helpers/charts.js'
import { selectLeverageBands } from '../../lib/selectors'
import { LeverageView } from './LeverageView'

const band = (overrides) => ({
  baselineCount: 6,
  adoptedCount: 7,
  baselineMedianCycleHours: 20,
  adoptedMedianCycleHours: 10,
  speedup: 2,
  comparable: true,
  ...overrides
})

const data = {
  adoptionStartDate: '2026-01-01T00:00:00.000Z',
  overallLeverageScore: 2,
  bandComparison: {
    XS: band(),
    S: band({ baselineCount: 2, comparable: false, speedup: 1.5 })
  }
}

describe('#selectLeverageBands', () => {
  test('Should return all five bands in order, filling missing ones', () => {
    const bands = selectLeverageBands(data)

    expect(bands.map((b) => b.band)).toEqual(['XS', 'S', 'M', 'L', 'XL'])
    expect(bands[0]).toMatchObject({ adoptedCount: 7, comparable: true })
    expect(bands[4]).toMatchObject({ adoptedCount: 0, comparable: false })
  })
})

describe('#LeverageView', () => {
  test('Should explain the method and show the band comparison', () => {
    render(<LeverageView leverage={{ data, status: 'success' }} />)

    expect(
      screen.getByRole('heading', {
        name: 'How Copilot Leverage Is Calculated'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/2× faster across 1 comparable band/)
    ).toBeInTheDocument()
    expect(screen.getByText('S:').parentElement).toHaveTextContent(
      'Not enough comparable pull requests'
    )
    const grouped = chartOptions().findLast(
      (o) => o?.series?.[0]?.name === 'Baseline'
    )
    expect(grouped.series.every((s) => s.stack === undefined)).toBe(true)
    expect(grouped.series[0].data[0]).toBe(20)
  })

  test('Should say when no band is comparable', () => {
    render(
      <LeverageView
        leverage={{
          data: { ...data, bandComparison: {} },
          status: 'success'
        }}
      />
    )

    expect(
      screen.getByText(/Not enough comparable pull requests yet/)
    ).toBeInTheDocument()
  })

  test('Should show loading and error states', () => {
    const { rerender } = render(
      <LeverageView leverage={{ data: null, status: 'loading' }} />
    )
    expect(screen.queryByText(/faster across/)).not.toBeInTheDocument()

    rerender(<LeverageView leverage={{ data: null, status: 'error' }} />)
    expect(
      screen.getByText('We could not load Copilot Leverage. Try again later.')
    ).toBeInTheDocument()
  })
})
