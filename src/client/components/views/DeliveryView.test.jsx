import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { buildPayloadV2 } from '#/test-helpers/payload-fixture.js'
import { axeViolations } from '#/test-helpers/axe.js'
import { chartOptions } from '#/test-helpers/charts.js'
import {
  selectDoneTickets,
  selectTicketFunnel,
  selectTicketRows
} from '../../lib/selectors'
import { DeliveryView, TicketView } from './DeliveryView'

const WINDOW = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  end: new Date('2026-02-01T00:00:00.000Z')
}

const issues = [
  {
    key: 'MMO-123',
    summary: 'Cycle time scatter',
    issueType: 'Story',
    status: { name: 'Done', categoryKey: 'done' },
    created: '2026-01-08T00:00:00.000Z',
    started: '2026-01-10T00:00:00.000Z',
    resolved: '2026-01-14T12:00:00.000Z',
    storyPoints: 3,
    reopenCount: 1,
    issueLinks: [{ key: 'MMO-124', type: 'is caused by', issueType: 'Bug' }],
    statusHistory: [
      { at: '2026-01-10T09:00:00.000Z', from: 'To do', to: 'In progress' },
      { at: '2026-01-14T12:00:00.000Z', from: 'In progress', to: 'Done' }
    ]
  },
  {
    key: 'MMO-124',
    summary: 'Merged but not closed',
    issueType: 'Bug',
    status: { name: 'In review', categoryKey: 'indeterminate' }
  },
  {
    key: 'MMO-125',
    summary: 'Started',
    issueType: 'Story',
    status: { name: 'In progress', categoryKey: 'indeterminate' }
  },
  {
    key: 'MMO-126',
    summary: 'Waiting',
    issueType: 'Task',
    status: { name: 'To do', categoryKey: 'new' }
  }
]

const payloads = [
  buildPayloadV2({ prNumber: 1, jiraKeys: ['MMO-123'] }),
  buildPayloadV2({ prNumber: 2, jiraKeys: ['MMO-124'] }),
  buildPayloadV2({ prNumber: 3, jiraKeys: [] })
]

const metrics = {
  leadTimeToDoneDays: 6,
  cycleTimeDays: 4.5,
  storiesDelivered: 1,
  reopenRate: 100,
  standardDeployableUnits: 0,
  firstScanPassRate: 0,
  unlinkedPrRate: 33.3,
  warnings: [{ key: 'MMO-123', type: 'done-with-open-pr' }]
}

const success = { metrics, issues, status: 'success', error: null }

const renderDelivery = (props = {}) => {
  const handlers = { onOpenTicket: vi.fn(), onOpenPR: vi.fn() }
  render(
    <DeliveryView
      delivery={success}
      payloads={payloads}
      window={WINDOW}
      jiraConnected
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('#ticket selectors', () => {
  test('Should derive rows, the funnel and the delivered set', () => {
    const rows = selectTicketRows(issues, payloads)

    expect(rows[0]).toMatchObject({
      key: 'MMO-123',
      cycleDays: 4.5,
      leadDays: 6.5,
      storyPoints: 3,
      links: [{ key: 'MMO-124', type: 'is caused by', issueType: 'Bug' }],
      reopenCount: 1,
      prs: [{ prNumber: 1, merged: true }]
    })
    expect(rows[0].history).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      leadDays: null,
      storyPoints: null,
      links: [],
      history: []
    })
    expect(selectTicketFunnel(rows)).toEqual([1, 1, 1, 1])
    expect(
      selectDoneTickets(rows, WINDOW.start, WINDOW.end).map((r) => r.key)
    ).toEqual(['MMO-123'])
    expect(
      selectDoneTickets(rows, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')
    ).toEqual([])
  })
})

describe('#DeliveryView', () => {
  describe('unmapped statuses notice', () => {
    const withUnmapped = (unmappedStatuses) => ({
      ...success,
      metrics: {
        ...metrics,
        workflow: { source: 'project', version: 2, unmappedStatuses }
      }
    })
    const unmapped = [
      { name: 'Funnel', issues: 3 },
      { name: 'Parked', issues: 1 }
    ]

    test('Should name the unmapped statuses to a project admin', () => {
      renderDelivery({
        delivery: withUnmapped(unmapped),
        canAdminister: true
      })

      expect(
        screen.getByText(/2 Jira statuses not in any workflow stage/)
      ).toHaveTextContent('Funnel, Parked')
      expect(
        screen.getByRole('link', { name: /map them in settings/i })
      ).toHaveAttribute('href', '#/settings/jira-workflow')
      expect(
        screen.getByRole('link', {
          name: 'Map them in Settings, under Jira Workflow and Definition of Done'
        })
      ).toBeVisible()
    })

    test('Should use the singular for one status', () => {
      renderDelivery({
        delivery: withUnmapped([{ name: 'Funnel', issues: 3 }]),
        canAdminister: true
      })

      expect(
        screen.getByText(/1 Jira status not in any workflow stage/)
      ).toBeInTheDocument()
    })

    test.each([
      ['a project user', withUnmapped(unmapped), false],
      ['an admin when every status is mapped', withUnmapped([]), true],
      ['an admin without a workflow summary', success, true]
    ])('Should not show the notice to %s', (_, delivery, canAdminister) => {
      renderDelivery({ delivery, canAdminister })

      expect(
        screen.queryByText(/not in any workflow stage/)
      ).not.toBeInTheDocument()
    })
  })

  describe('Jira notices', () => {
    const withJira = (jira, extra = {}) => ({
      ...success,
      metrics: { ...metrics, jira, ...extra }
    })
    const region = (name) => screen.queryByRole('region', { name })

    test('Should show no notice when the backend sends none', () => {
      renderDelivery()

      expect(region('Jira Not Reached')).toBeNull()
      expect(region('Refreshing Jira Data')).toBeNull()
      expect(screen.queryByText(/quality gates are not yet/)).toBeNull()
    })

    test('Should say Jira is being refreshed without hiding the metrics', () => {
      renderDelivery({ delivery: withJira({ pending: true }) })

      expect(region('Refreshing Jira Data')).toHaveTextContent(
        'Jira data is being refreshed. This page updates when it is ready.'
      )
      expect(screen.getByText(/ticket reopen rate/i)).toBeInTheDocument()
    })

    test.each([
      ['stale', { stale: true }],
      ['unavailable', { error: 'unavailable' }]
    ])('Should say Jira could not be reached when %s', (_, jira) => {
      renderDelivery({ delivery: withJira(jira) })

      expect(region('Jira Not Reached')).toHaveTextContent(
        'Jira could not be reached; showing the last data stored.'
      )
    })

    test('Should give the time the data was last refreshed', () => {
      renderDelivery({
        delivery: withJira({
          stale: true,
          refreshedAt: '2026-01-14T12:00:00.000Z'
        })
      })

      expect(region('Jira Not Reached')).toHaveTextContent(
        'showing the last data stored, from 14 Jan, 12:00 UTC.'
      )
    })

    test('Should ignore a malformed refresh time and flag', () => {
      renderDelivery({
        delivery: withJira({ stale: 'true', pending: 'yes', refreshedAt: 'x' })
      })

      expect(region('Jira Not Reached')).toBeNull()
      expect(region('Refreshing Jira Data')).toBeNull()
    })

    test('Should tell a project admin the Jira credentials were rejected', () => {
      renderDelivery({
        delivery: withJira({ error: 'credentials' }),
        canAdminister: true
      })

      expect(region('Jira Credentials Rejected')).toBeVisible()
      expect(region('Jira Not Reached')).toBeNull()
    })

    test('Should tell a project admin the Jira project is not visible', () => {
      renderDelivery({
        delivery: withJira({ error: 'not-visible' }),
        canAdminister: true
      })

      expect(region('Jira Project Not Visible')).toBeVisible()
    })

    test.each(['credentials', 'not-visible'])(
      'Should give other users the plain unreachable notice for %s',
      (error) => {
        renderDelivery({ delivery: withJira({ error }) })

        expect(region('Jira Not Reached')).toBeVisible()
        expect(region('Jira Credentials Rejected')).toBeNull()
        expect(region('Jira Project Not Visible')).toBeNull()
      }
    )

    test('Should hint when some quality gates are not yet available', () => {
      renderDelivery({
        delivery: withJira(undefined, { sonar: { stale: true } })
      })

      expect(
        screen.getByText('Some quality gates are not yet available.')
      ).toBeVisible()
    })

    test('Should have no detectable accessibility violations', async () => {
      render(
        <DeliveryView
          delivery={withJira({ pending: true, stale: true })}
          payloads={payloads}
          window={WINDOW}
          jiraConnected
          onOpenTicket={vi.fn()}
          onOpenPR={vi.fn()}
        />
      )

      expect(await axeViolations(document.body)).toEqual([])
    })
  })

  describe('Story throughput', () => {
    test('Should show stories, story points, bugs and other items separately', () => {
      renderDelivery({
        delivery: {
          ...success,
          metrics: {
            ...metrics,
            storiesDelivered: 4,
            storyPointsDelivered: 13,
            bugsDelivered: 2,
            otherItemsDelivered: 1
          }
        }
      })

      for (const [name, value] of [
        [/stories delivered/i, '4'],
        [/story points delivered/i, '13'],
        [/bugs delivered/i, '2'],
        [/other items delivered/i, '1']
      ]) {
        expect(screen.getByRole('article', { name })).toHaveTextContent(value)
      }
    })

    test('Should drill throughput into delivered stories only', async () => {
      renderDelivery({
        delivery: {
          ...success,
          issues: [
            ...issues,
            {
              key: 'MMO-127',
              summary: 'Sub work',
              issueType: 'Sub-task',
              status: { name: 'Done', categoryKey: 'done' },
              created: '2026-01-09T00:00:00.000Z',
              started: '2026-01-10T00:00:00.000Z',
              resolved: '2026-01-12T00:00:00.000Z'
            }
          ]
        }
      })

      await userEvent.click(
        screen.getByRole('button', { name: /stories delivered/i })
      )

      const drill = document.getElementById('delivery-drill-flow')
      expect(
        within(drill).getByRole('button', { name: /MMO-123/ })
      ).toBeVisible()
      expect(
        within(drill).queryByRole('button', { name: /MMO-127/ })
      ).toBeNull()
      expect(
        screen.getByText(/Distinct stories reaching Done/)
      ).toBeInTheDocument()
    })

    test('Should drill other items into those that are neither stories nor bugs', async () => {
      renderDelivery({
        delivery: {
          ...success,
          issues: [
            ...issues,
            {
              key: 'MMO-128',
              summary: 'Parentless task',
              issueType: 'Task',
              status: { name: 'Done', categoryKey: 'done' },
              created: '2026-01-09T00:00:00.000Z',
              started: '2026-01-10T00:00:00.000Z',
              resolved: '2026-01-12T00:00:00.000Z'
            }
          ]
        }
      })

      await userEvent.click(
        screen.getByRole('button', { name: /other items delivered/i })
      )

      const drill = document.getElementById('delivery-drill-flow')
      expect(
        within(drill).getByRole('button', { name: /MMO-128/ })
      ).toBeVisible()
      expect(
        within(drill).queryByRole('button', { name: /MMO-123/ })
      ).toBeNull()
    })

    test('Should list the points of each delivered story', async () => {
      renderDelivery()

      await userEvent.click(
        screen.getByRole('button', { name: /story points delivered/i })
      )

      const drill = document.getElementById('delivery-drill-flow')
      expect(within(drill).getByText('3 points')).toBeVisible()
    })

    test('Should chart stories delivered per sprint', () => {
      renderDelivery({
        trend: {
          status: 'success',
          points: [
            {
              label: 'S6',
              delivered: 4,
              predictability: 75,
              changeFailRate: 0
            },
            {
              label: 'S7',
              delivered: 5,
              predictability: 80,
              changeFailRate: 40
            }
          ]
        }
      })

      expect(
        screen.getByRole('heading', { name: /Stories Delivered per Sprint/ })
      ).toBeVisible()
    })
  })

  test('Should explain that Jira metrics need a Jira project key', () => {
    renderDelivery({ jiraConnected: false })

    expect(
      screen.getByText(
        'Jira delivery metrics are not available because this project has no Jira project key.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('Should show loading and error states', () => {
    const { unmount } = render(
      <DeliveryView
        delivery={{ ...success, metrics: null, status: 'loading' }}
        payloads={[]}
        window={WINDOW}
        jiraConnected
        onOpenTicket={vi.fn()}
        onOpenPR={vi.fn()}
      />
    )
    expect(screen.queryByText('Ticket lead time')).not.toBeInTheDocument()
    unmount()

    renderDelivery({
      delivery: { ...success, metrics: null, status: 'error' }
    })
    expect(
      screen.getByText('We could not load delivery metrics. Try again later.')
    ).toBeInTheDocument()
  })

  test('Should explain that no tickets are linked yet', () => {
    renderDelivery({ delivery: { ...success, issues: [] } })

    expect(
      screen.getByText(
        "No Jira tickets are linked to this project's pull requests yet. A ticket appears here once a pull request names it in its branch, title or commit messages."
      )
    ).toBeInTheDocument()
  })

  test('Should show the KPIs, the funnel and the open-PR warning', () => {
    renderDelivery()

    expect(screen.getByText('Measured to Jira Done')).toBeInTheDocument()
    expect(screen.getByText(/ticket reopen rate/i)).toBeInTheDocument()
    expect(screen.getByText(/marked Done still has an open pull/)).toBeVisible()
    const funnel = chartOptions().findLast((o) =>
      o?.yAxis?.data?.includes?.('PR merged')
    )
    expect(funnel.series[0].data).toEqual([1, 1, 1, 1])
  })

  test('Should group the KPIs into DORA, flow and quality subsections', () => {
    renderDelivery()

    for (const name of [
      'Delivery-based DORA',
      'Flow',
      'Quality and Data Hygiene'
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByText(/work in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/story point velocity/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'By Sprint' })
    ).not.toBeInTheDocument()
  })

  test('Should drill into the tickets in progress', async () => {
    const { onOpenTicket } = renderDelivery()

    await userEvent.click(
      screen.getByRole('button', { name: /work in progress/i })
    )
    const drill = document.getElementById('delivery-drill-flow')
    await userEvent.click(
      within(drill).getByRole('button', { name: /MMO-125/ })
    )

    expect(onOpenTicket).toHaveBeenCalledWith('MMO-125')
  })

  test('Should chart delivery by sprint when a trend is loaded', () => {
    renderDelivery({
      trend: {
        status: 'success',
        points: [
          { label: 'S6', delivered: 4, predictability: 75, changeFailRate: 0 },
          { label: 'S7', delivered: 5, predictability: 80, changeFailRate: 40 }
        ]
      }
    })

    expect(screen.getByRole('heading', { name: 'By Sprint' })).toBeVisible()
    const lines = chartOptions().findLast(
      (o) => o?.series?.[0]?.name === 'Predictability'
    )
    expect(lines.series.map((s) => s.data)).toEqual([
      [75, 80],
      [0, 40]
    ])
  })

  test('Should open a ticket from the table', async () => {
    const { onOpenTicket } = renderDelivery()
    const table = screen.getByRole('table', { name: /^Jira tickets/ })

    await userEvent.click(
      within(table).getByRole('button', { name: /MMO-124/ })
    )

    expect(onOpenTicket).toHaveBeenCalledWith('MMO-124')
  })

  test('Should drill into the unlinked pull requests', async () => {
    const { onOpenPR } = renderDelivery()

    await userEvent.click(
      screen.getByRole('button', { name: /unlinked PR rate/i })
    )
    await userEvent.click(screen.getByRole('button', { name: /#3/ }))

    expect(onOpenPR).toHaveBeenCalledWith('DEFRA/mmo-cr-copilot-dashboard', 3)
  })
})

describe('#TicketView', () => {
  test('Should list the ticket fields and open a linked PR', async () => {
    const onOpenPR = vi.fn()
    render(
      <TicketView
        ticketKey="MMO-123"
        delivery={success}
        payloads={payloads}
        jiraConnected
        onOpenPR={onOpenPR}
      />
    )

    expect(screen.getByText('Cycle time scatter')).toBeInTheDocument()
    expect(screen.getByText('4.5 days')).toBeInTheDocument()
    expect(screen.getByText('1 time')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /#1/ }))
    expect(onOpenPR).toHaveBeenCalledWith('DEFRA/mmo-cr-copilot-dashboard', 1)
  })

  test('Should show lead time, links and the status history', async () => {
    const onOpenTicket = vi.fn()
    render(
      <TicketView
        ticketKey="MMO-123"
        delivery={success}
        payloads={payloads}
        jiraConnected
        onOpenTicket={onOpenTicket}
        onOpenPR={vi.fn()}
      />
    )

    expect(screen.getByText('6.5 days')).toBeInTheDocument()
    expect(screen.getByText('8 Jan 2026')).toBeInTheDocument()
    const history = screen.getByRole('table', { name: /Status changes/ })
    expect(within(history).getAllByRole('row')).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'MMO-124' }))
    expect(onOpenTicket).toHaveBeenCalledWith('MMO-124')
  })

  test('Should say when the ticket has not been fetched', () => {
    render(
      <TicketView
        ticketKey="MMO-999"
        delivery={success}
        payloads={payloads}
        jiraConnected
        onOpenPR={vi.fn()}
      />
    )

    expect(
      screen.getByText(
        "We have no details for ticket MMO-999. Only tickets linked to this project's pull requests, and their parent stories, are fetched from Jira."
      )
    ).toBeInTheDocument()
  })

  test('Should show the Jira notices and keep the ticket on screen', () => {
    render(
      <TicketView
        ticketKey="MMO-123"
        delivery={{
          ...success,
          metrics: { ...metrics, jira: { stale: true } }
        }}
        payloads={payloads}
        jiraConnected
        onOpenPR={vi.fn()}
      />
    )

    expect(
      screen.getByRole('region', { name: 'Jira Not Reached' })
    ).toBeVisible()
    expect(screen.getByText('Cycle time scatter')).toBeVisible()
  })
})
