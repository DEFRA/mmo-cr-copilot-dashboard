import { render, screen, within } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { lastChartOption } from '#/test-helpers/charts.js'
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
      screen.getByRole('heading', { name: 'GitHub Copilot Usage Metrics' })
    ).toBeInTheDocument()
    const table = screen.getByRole('table', {
      name: 'Requests and AI credits by model'
    })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4)
    const row = within(table).getByRole('row', { name: /claude-sonnet-4\.5/ })
    expect(within(row).getByText('9.5')).toBeInTheDocument()
    expect(within(row).getByText('82.6%')).toBeInTheDocument()
    expect(within(row).getByText('12.35')).toBeInTheDocument()
    const legacy = within(table).getByRole('row', { name: /gpt-5/ })
    expect(within(legacy).getByText('17.4%')).toBeInTheDocument()
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
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText(/Coverage:/)).not.toBeInTheDocument()
  })

  test('Should chart each model share of requests beside the table', () => {
    render(<CopilotUsagePanel usage={usage()} />)

    expect(
      screen.getByRole('img', {
        name: 'Share of Requests by Model: claude-sonnet-4.5 82.6%, gpt-5 17.4%'
      })
    ).toBeInTheDocument()
    expect(screen.getByText('Share of Requests by Model')).toBeInTheDocument()
    const [series] = lastChartOption().series
    expect(series.type).toBe('pie')
    expect(series.data.map((d) => [d.model, d.value, d.share])).toEqual([
      ['claude-sonnet-4.5', 9.5, 82.6],
      ['gpt-5', 2, 17.4]
    ])
    expect(series.data[0].itemStyle.color).not.toBe(
      series.data[1].itemStyle.color
    )
    expect(series.data[1].itemStyle.decal).toBeDefined()
  })

  test('Should show the percentage in the legend and tooltip', () => {
    render(<CopilotUsagePanel usage={usage()} />)

    const option = lastChartOption()

    expect(option.legend.formatter('model:gpt-5')).toBe('gpt-5 17.4%')
    expect(option.legend.formatter('unknown')).toBe('unknown')
    expect(
      option.tooltip.formatter({
        name: 'model:<b>x</b>',
        value: 2,
        data: { model: '<b>x</b>', share: 17.4 }
      })
    ).toBe('&lt;b&gt;x&lt;/b&gt;: 2 requests (17.4%)')
  })

  test('Should chart a single model as the whole', () => {
    render(
      <CopilotUsagePanel
        usage={usage({ models: [{ model: 'gpt-5', requests: 4, credits: 1 }] })}
      />
    )

    expect(lastChartOption().series[0].data).toHaveLength(1)
    expect(lastChartOption().series[0].data[0].share).toBe(100)
    expect(screen.getByRole('img', { name: /gpt-5 100%/ })).toBeInTheDocument()
  })

  test('Should fold the tail of many models into Other models', () => {
    const models = Array.from({ length: 8 }, (_, i) => ({
      model: `model-${i}`,
      requests: 10 - i,
      credits: null
    }))
    render(<CopilotUsagePanel usage={usage({ models })} />)

    const data = lastChartOption().series[0].data

    expect(data).toHaveLength(6)
    expect(data.at(-1).model).toBe('Other models')
    expect(new Set(data.map((d) => d.name)).size).toBe(6)
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      9
    )
  })

  test('Should not merge a model called Other models with the folded tail', () => {
    const models = Array.from({ length: 7 }, (_, i) => ({
      model: i === 0 ? 'Other models' : `model-${i}`,
      requests: 10 - i,
      credits: null
    }))
    render(<CopilotUsagePanel usage={usage({ models })} />)

    const option = lastChartOption()
    const names = option.series[0].data.map((d) => d.name)

    expect(new Set(names).size).toBe(names.length)
    expect(option.legend.formatter(names[0])).toBe('Other models 20.4%')
    expect(option.legend.formatter(names.at(-1))).toBe('Other models 18.4%')
  })

  test('Should show a dash for the share of a model with no requests', () => {
    render(
      <CopilotUsagePanel
        usage={usage({
          models: [
            { model: 'gpt-5', requests: 4, credits: 1 },
            { model: 'idle', requests: 0, credits: null }
          ]
        })}
      />
    )

    const row = within(screen.getByRole('table')).getByRole('row', {
      name: /idle/
    })
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  test('Should keep the table but skip the chart when no model has requests', () => {
    render(
      <CopilotUsagePanel
        usage={usage({ models: [{ model: 'gpt-5', requests: 0, credits: 1 }] })}
      />
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
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
