import { render, screen, within } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { CopilotUsagePanel } from './CopilotUsagePanel'

const usage = (overrides = {}) => ({
  models: [
    { model: 'claude-sonnet-4.5', requests: 9.5, credits: 12.3456 },
    { model: 'gpt-5', requests: 2, credits: null }
  ],
  prsWithUsage: 2,
  prsWithCredits: 1,
  assistedPrs: 5,
  coveragePercent: 40,
  totalCredits: 12.3456,
  medianCreditsPerPr: 1234.5,
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
    expect(within(row).getByText('9.5')).toBeInTheDocument()
    expect(within(row).getByText('12.35')).toBeInTheDocument()
    const legacy = within(table).getByRole('row', { name: /gpt-5/ })
    expect(within(legacy).getByText('Not recorded')).toBeInTheDocument()
    expect(screen.getByText('1,234.50')).toBeInTheDocument()
    expect(screen.queryByText(/tokens/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/inline completions\s+use none/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Coverage: 2 of 5 pull requests with Copilot-written lines have usage, 1 with\s+credits/
      )
    ).toBeInTheDocument()
  })

  test('Should say no usage is recorded instead of showing an empty table', () => {
    render(
      <CopilotUsagePanel
        usage={usage({
          models: [],
          prsWithUsage: 0,
          prsWithCredits: 0,
          totalCredits: null,
          medianCreditsPerPr: null,
          assistedPrs: 0
        })}
      />
    )

    expect(screen.getByText('No usage recorded')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/Coverage:/)).not.toBeInTheDocument()
  })

  test('Should omit the median when no pull request recorded credits', () => {
    render(<CopilotUsagePanel usage={usage({ medianCreditsPerPr: null })} />)

    expect(
      screen.queryByText(/AI credits per pull request/)
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
        usage={usage({ models: [], medianCreditsPerPr: null })}
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
