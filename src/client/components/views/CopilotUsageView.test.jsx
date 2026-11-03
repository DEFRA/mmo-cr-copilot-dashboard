import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { chartOptions } from '#/test-helpers/charts.js'
import {
  buildCommitV2,
  buildPayloadV2
} from '#/test-helpers/payload-fixture.js'
import { CopilotUsageView } from './CopilotUsageView'

const usageCommit = (models) => ({
  ...buildCommitV2(),
  author: 'ada-lovelace',
  committedAt: '2026-01-15T12:00:00',
  classification: 'Copilot-assisted',
  attribution: {
    source: 'extension',
    version: 1,
    typedLines: 1,
    usage: { models, sessions: 1, commitsWithUsage: 1 }
  }
})

const model = (name, extra) => ({
  model: name,
  requests: 1,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  reasoningTokens: 0,
  ...extra
})

const gpt = model('gpt-5', {
  requests: 5,
  inputTokens: 1000,
  outputTokens: 250,
  cacheReadTokens: 500
})
const claude = model('claude-sonnet', {
  requests: 2,
  inputTokens: 500,
  outputTokens: 100
})

const PAYLOADS = [1, 2].map((prNumber) =>
  buildPayloadV2({
    prNumber,
    commitBreakdown: [usageCommit([gpt, claude])]
  })
)

describe('#CopilotUsageView', () => {
  test('Should show the headings, four KPI cards, two figures and the leaderboard', () => {
    const { container } = render(<CopilotUsageView payloads={PAYLOADS} />)

    expect(
      screen.getByRole('heading', { name: 'Model and Token Usage', level: 2 })
    ).toBeInTheDocument()
    expect(screen.getByText(/2 pull requests with usage/)).toBeInTheDocument()
    for (const label of [
      'Team Favourite Model',
      'Model Requests',
      'Tokens Used',
      'Cache Hit Rate'
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(
      container.querySelectorAll('.app-scope > .app-kpi-grid > *')
    ).toHaveLength(4)
    expect(
      screen.getByText('71.4% of model requests · 2 pull requests')
    ).toBeInTheDocument()
    expect(screen.getByText('Across 2 models')).toBeInTheDocument()
    expect(screen.getAllByText('3.7k').length).toBeGreaterThan(0)
    expect(screen.getByText('3,000 input · 700 output')).toBeInTheDocument()
    expect(
      screen.getByText('1,000 of 3,000 input tokens from cache')
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: 'Team Superlatives', level: 3 })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Model Leaderboard', level: 3 })
    ).toBeInTheDocument()
    expect(container.querySelectorAll('figure')).toHaveLength(2)
    expect(
      screen.getByRole('heading', { name: 'Requests by Model', level: 4 })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Tokens by Model and Type',
        level: 4
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /Tokens per request/ })
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('rowheader', { name: /claude-sonnet/ }).length
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/Inline completions do not report tokens/)
    ).toBeInTheDocument()
  })

  test('Should chart requests and token types per model', () => {
    render(<CopilotUsageView payloads={PAYLOADS} />)

    const requests = chartOptions().findLast(
      (o) => o?.series?.[0]?.name === 'Requests'
    )
    const tokens = chartOptions().findLast(
      (o) => o?.series?.[0]?.name === 'Uncached input'
    )

    expect(requests.series[0].data).toEqual([10, 4])
    expect(tokens.series.map((s) => s.name)).toEqual([
      'Uncached input',
      'Cache read',
      'Output'
    ])
    expect(tokens.series.map((s) => s.data)).toEqual([
      [1, 1],
      [1, 0],
      [0.5, 0.2]
    ])
  })

  test('Should not expose any author', () => {
    const { container } = render(<CopilotUsageView payloads={PAYLOADS} />)

    expect(container.textContent).not.toMatch(/ada|lovelace/i)
    expect(JSON.stringify(chartOptions())).not.toMatch(/ada|lovelace/i)
  })

  test('Should explain how to start recording usage when there is none', () => {
    const { container } = render(<CopilotUsageView payloads={[]} />)

    expect(screen.getByText('No usage recorded')).toBeInTheDocument()
    expect(
      screen.getByText(/turn on the Copilot usage log/)
    ).toBeInTheDocument()
    expect(screen.getByText(/0 of 0 pull requests/)).toBeInTheDocument()
    expect(container.querySelectorAll('.app-kpi-grid')).toHaveLength(0)
    expect(container.querySelectorAll('figure')).toHaveLength(0)
  })

  test('Should report the cache as not reported when no input is cached', () => {
    render(
      <CopilotUsageView
        payloads={[
          buildPayloadV2({
            prNumber: 1,
            commitBreakdown: [usageCommit([model('solo')])]
          })
        ]}
      />
    )

    expect(screen.getAllByText('Not reported').length).toBeGreaterThan(0)
  })

  test('Should have no accessibility violations when empty or populated', async () => {
    const empty = render(<CopilotUsageView payloads={[]} />)
    expect(await axeViolations(empty.container)).toEqual([])
    empty.unmount()

    const populated = render(<CopilotUsageView payloads={PAYLOADS} />)
    expect(await axeViolations(populated.container)).toEqual([])
  })
})
