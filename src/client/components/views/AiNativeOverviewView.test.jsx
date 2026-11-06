import { render, screen, within } from '@testing-library/react'

import { buildPayloadV2 } from '#/test-helpers/payload-fixture.js'
import { AiNativeOverviewView } from './AiNativeOverviewView'

const WINDOW = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  end: new Date('2026-02-01T00:00:00.000Z')
}

const metrics = {
  storiesDelivered: 1,
  changeLeadTimeDays: 4.2,
  deliveryFrequencyPerWeek: 2.5,
  defectRecoveryTimeDays: null,
  changeFailRate: 0,
  failedTickets: [],
  deliveryReworkRate: 0,
  cycleTimeDays: 3,
  flowEfficiency: 46,
  sprintPredictability: 82.1,
  sprints: [],
  prCycleTimeHours: 12,
  reopenRate: 0,
  warnings: []
}

const leverageData = {
  ownBaseline: {
    baselineSprintCount: 3,
    baselineMedianCycleHours: 20,
    currentMedianCycleHours: 10,
    baselineCount: 6,
    currentCount: 7,
    comparable: true,
    speedup: 2
  },
  complexityWeightedThroughput: 240,
  mergedPullRequests: 7,
  deliveryQuality: {
    changeFailRate: 8.7,
    deliveryReworkRate: 13,
    reopenRate: 4.3
  },
  codeDurability: { available: false }
}

const usagePayload = () =>
  buildPayloadV2({
    prNumber: 1,
    commitBreakdown: [
      {
        ...buildPayloadV2().commitBreakdown[0],
        classification: 'Copilot-assisted',
        attribution: {
          source: 'extension',
          version: 1,
          typedLines: 1,
          usage: {
            models: [
              {
                model: 'gpt-5',
                requests: 3,
                inputTokens: 1000,
                outputTokens: 100,
                credits: 0.42
              }
            ],
            sessions: 1,
            commitsWithUsage: 1
          }
        }
      }
    ]
  })

const renderView = (props = {}) =>
  render(
    <AiNativeOverviewView
      payloads={[buildPayloadV2({ prNumber: 1 })]}
      windowKey="w"
      window={WINDOW}
      delivery={{ metrics, issues: [], status: 'success' }}
      leverage={{ data: leverageData, status: 'success' }}
      jiraConnected
      onOpenRepo={vi.fn()}
      onOpenTicket={vi.fn()}
      onOpenPR={vi.fn()}
      {...props}
    />
  )

describe('#AiNativeOverviewView', () => {
  test('Should show delivery and flow KPIs measured to Jira Done', () => {
    renderView()

    for (const label of [
      /change lead time/i,
      /delivery frequency/i,
      /defect recovery time/i,
      /change fail rate/i,
      /delivery rework rate/i,
      /sprint predictability/i,
      /flow efficiency/i
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  test('Should show the four leverage components side by side', () => {
    renderView()

    for (const title of [
      'Own-Baseline Trend',
      'Complexity-Weighted Throughput',
      'Delivery Quality',
      'AI Code Durability'
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.getByText('2× faster')).toBeInTheDocument()
    expect(screen.getByText('240')).toBeInTheDocument()
    expect(screen.getByText('Not available yet')).toBeInTheDocument()
  })

  test('Should show how much AI code survived once the survival workflow has measured it', () => {
    renderView({
      leverage: {
        data: {
          ...leverageData,
          codeDurability: {
            available: true,
            windowDays: 21,
            prCount: 3,
            aiSurvivalPercent: 72.5,
            humanSurvivalPercent: 90
          }
        },
        status: 'success'
      },
      churn: {
        status: 'success',
        data: {
          available: true,
          windowDays: 21,
          prCount: 3,
          aiLinesMerged: 400,
          aiLinesSurviving: 290,
          churnRatePercent: 27.5,
          humanChurnPercent: 10,
          penaltyApplied: true,
          effectiveMultiplier: 0.725,
          byOrigin: {}
        }
      }
    })

    expect(screen.getByText('72.5%')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'AI Code Churn (21 Days)' })
    ).toBeInTheDocument()
    expect(screen.getByText('27.5%')).toBeInTheDocument()
    expect(screen.getByText('Penalty Applied')).toBeInTheDocument()
    expect(screen.queryByText('Not available yet')).not.toBeInTheDocument()
  })

  test('Should show Copilot model usage with its caveat', () => {
    renderView({ payloads: [usagePayload()] })

    expect(
      screen.getByRole('heading', { name: 'GitHub Copilot Usage Metrics' })
    ).toBeInTheDocument()
    expect(screen.getByText('gpt-5')).toBeInTheDocument()
    expect(screen.getAllByText('0.42').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/inline completions\s+use none/)
    ).toBeInTheDocument()
  })

  test('Should link to the usage insights when a href is supplied', () => {
    renderView({
      payloads: [usagePayload()],
      insightsHref: '#/projects/p/copilot-usage'
    })

    expect(
      screen.getByRole('link', { name: /See Copilot usage insights/ })
    ).toHaveAttribute('href', '#/projects/p/copilot-usage')
  })

  test('Should render no adoption, assist-rate or classification measures', () => {
    const { container } = renderView()
    const text = container.textContent

    for (const banned of [
      /adoption/i,
      /assist rate/i,
      /copilot-assisted/i,
      /human-authored/i,
      /reclassif/i,
      /copilot leverage/i
    ]) {
      expect(text).not.toMatch(banned)
    }
    expect(
      screen.queryByRole('button', { name: /change classification/i })
    ).not.toBeInTheDocument()
  })

  test('Should list repositories by name without ranking', () => {
    renderView({
      payloads: [
        buildPayloadV2({ prNumber: 1, repository: 'DEFRA/zeta' }),
        buildPayloadV2({ prNumber: 2, repository: 'DEFRA/alpha' })
      ]
    })

    const table = screen.getByRole('table', { name: /repository comparison/i })
    const names = within(table)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names).toEqual(['alpha', 'zeta'])
  })

  test('Should hide every Jira metric when the project has no Jira key', () => {
    renderView({ jiraConnected: false })

    expect(
      screen.getByRole('heading', { name: 'Project Activity' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Flow and Predictability' })
    ).toBeNull()
    expect(screen.queryByText(/measured to Jira Done/)).toBeNull()
    expect(screen.queryByText('Delivery Quality')).toBeNull()
    expect(screen.queryByText(/Where Tickets Are/i)).toBeNull()
    expect(screen.queryByText(/no Jira project key/)).toBeNull()
  })

  test('Should tell a project admin why the Jira metrics are hidden', () => {
    renderView({ jiraConnected: false, canAdminister: true })

    expect(
      screen.getByText(
        'Jira delivery metrics are hidden because this project has no Jira project key.'
      )
    ).toBeInTheDocument()
  })
})
