import { render, screen, within } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { CopilotUsagePanel } from './CopilotUsagePanel'

const usage = (overrides = {}) => ({
  models: [
    {
      model: 'claude-sonnet-4.5',
      requests: 9,
      inputTokens: 48211,
      outputTokens: 3112,
      cachedTokens: 30120
    },
    {
      model: 'gpt-5',
      requests: 2,
      inputTokens: 500,
      outputTokens: 50,
      cachedTokens: 0
    }
  ],
  prsWithUsage: 2,
  assistedPrs: 5,
  coveragePercent: 40,
  medianTokensPerPr: 25000,
  ...overrides
})

describe('#CopilotUsagePanel', () => {
  test('Should list usage by model with the caveat and coverage always visible', () => {
    render(<CopilotUsagePanel usage={usage()} />)

    expect(
      screen.getByRole('heading', { name: 'Copilot Model Usage' })
    ).toBeInTheDocument()
    const table = screen.getByRole('table', {
      name: 'Copilot model usage by model'
    })
    const row = within(table).getByRole('row', { name: /claude-sonnet-4\.5/ })
    expect(within(row).getByText('48,211')).toBeInTheDocument()
    expect(within(row).getByText('30,120')).toBeInTheDocument()
    expect(screen.getByText('25,000')).toBeInTheDocument()
    expect(
      screen.getByText(/Inline completions do not report tokens/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Coverage: 2 of 5 pull requests with Copilot-written lines/
      )
    ).toBeInTheDocument()
  })

  test('Should say no usage is recorded instead of showing an empty table', () => {
    render(
      <CopilotUsagePanel
        usage={usage({
          models: [],
          prsWithUsage: 0,
          medianTokensPerPr: null,
          assistedPrs: 0
        })}
      />
    )

    expect(screen.getByText('No usage recorded')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/Coverage:/)).not.toBeInTheDocument()
  })

  test('Should omit the median when it cannot be computed', () => {
    render(<CopilotUsagePanel usage={usage({ medianTokensPerPr: null })} />)

    expect(
      screen.queryByText(/Tokens per pull request with usage/)
    ).not.toBeInTheDocument()
  })

  test('Should link to the usage insights when usage is present', () => {
    render(
      <CopilotUsagePanel
        usage={usage()}
        insightsHref="#/projects/p/copilot-usage"
      />
    )

    expect(
      screen.getByRole('link', { name: /See Copilot usage insights/ })
    ).toHaveAttribute('href', '#/projects/p/copilot-usage')
  })

  test('Should not link to the insights without a href', () => {
    render(<CopilotUsagePanel usage={usage()} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('Should not link to the insights when no usage is recorded', () => {
    render(
      <CopilotUsagePanel
        usage={usage({ models: [], medianTokensPerPr: null })}
        insightsHref="#/projects/p/copilot-usage"
      />
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('Should have no accessibility violations', async () => {
    const { container } = render(<CopilotUsagePanel usage={usage()} />)

    expect(await axeViolations(container)).toEqual([])
  })
})
