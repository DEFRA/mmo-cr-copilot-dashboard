import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { buildPayloadV2 } from '#/test-helpers/payload-fixture.js'
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
  test('Should say Jira is not connected', () => {
    renderDelivery({ jiraConnected: false })

    expect(
      screen.getByText('Jira is not connected for this project.')
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

  test('Should show an empty ticket table when nothing is synced', () => {
    renderDelivery({ delivery: { ...success, issues: [] } })

    expect(
      screen.getByText('No Jira tickets have been synced for this project yet.')
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

  test('Should say when the ticket has not been synced', () => {
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
      screen.getByText('Ticket MMO-999 has not been synced from Jira.')
    ).toBeInTheDocument()
  })
})
