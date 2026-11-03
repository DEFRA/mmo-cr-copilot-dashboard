import { render, screen, within } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { AiCodeChurnPanel } from './AiCodeChurnPanel'

const churn = (overrides = {}) => ({
  projectSlug: 'p',
  windowDays: 21,
  available: true,
  prCount: 4,
  aiLinesMerged: 1200,
  aiLinesSurviving: 900,
  churnRatePercent: 25,
  humanChurnPercent: 10,
  penaltyApplied: false,
  effectiveMultiplier: 1,
  byOrigin: {
    aiAgent: { merged: 800, surviving: 640, churnPercent: 20 },
    aiCompletion: { merged: 300, surviving: 180, churnPercent: 40 },
    aiChat: { merged: 100, surviving: 80, churnPercent: 20 }
  },
  ...overrides
})

describe('#AiCodeChurnPanel', () => {
  test('Should show the churn rate, human comparison and the data behind the chart', () => {
    render(<AiCodeChurnPanel churn={churn()} status="success" number={4} />)

    expect(
      screen.getByRole('heading', { name: 'AI Code Churn (21 Days)' })
    ).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(
      screen.getByText(/Human lines in the same pull requests: 10%/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Measured on 4 pull requests, 1,200 AI lines merged/)
    ).toBeInTheDocument()
    expect(screen.queryByText('Penalty Applied')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /churn by ai origin/i })
    ).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getByText('Completion')).toBeInTheDocument()
    expect(within(table).getByText('40%')).toBeInTheDocument()
  })

  test('Should state the penalty and the volume multiplier above 25 percent', () => {
    render(
      <AiCodeChurnPanel
        churn={churn({
          churnRatePercent: 40,
          penaltyApplied: true,
          effectiveMultiplier: 0.6
        })}
        status="success"
        number={4}
      />
    )

    expect(screen.getByText('Penalty Applied')).toBeInTheDocument()
    expect(screen.getByText(/multiplied by 0.6/)).toBeInTheDocument()
  })

  test('Should say it is not available yet, using the reason from the backend', () => {
    render(
      <AiCodeChurnPanel
        churn={{
          available: false,
          windowDays: 21,
          reason: 'No AI lines merged in this period have reached 21 days yet'
        }}
        status="success"
        number={4}
      />
    )

    expect(screen.getByText('Not available yet')).toBeInTheDocument()
    expect(screen.getByText(/have reached 21 days yet/)).toBeInTheDocument()
  })

  test('Should fall back to a default message and show loading and error states', () => {
    const { rerender } = render(
      <AiCodeChurnPanel
        churn={{ available: false }}
        status="success"
        number={4}
      />
    )
    expect(screen.getByText(/have reached 21 days yet\./)).toBeInTheDocument()

    rerender(<AiCodeChurnPanel churn={null} status="loading" number={4} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      /Loading AI Code Churn/
    )

    rerender(<AiCodeChurnPanel churn={null} status="error" number={4} />)
    expect(
      screen.getByText(/could not load AI code churn/i)
    ).toBeInTheDocument()
  })

  test('Should show a dash for churn that cannot be computed', () => {
    render(
      <AiCodeChurnPanel
        churn={churn({ humanChurnPercent: null, byOrigin: {} })}
        status="success"
        number={4}
      />
    )

    expect(
      screen.getByText(/Human lines in the same pull requests: –/)
    ).toBeInTheDocument()
  })

  test('Should have no accessibility violations', async () => {
    const { container } = render(
      <AiCodeChurnPanel churn={churn()} status="success" number={4} />
    )

    expect(await axeViolations(container)).toEqual([])
  })
})
