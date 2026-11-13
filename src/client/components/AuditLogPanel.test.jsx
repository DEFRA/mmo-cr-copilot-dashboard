import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AuditLogPanel, actorLabel } from './AuditLogPanel'

const entry = (overrides = {}) => ({
  id: '1',
  occurredAt: '2026-02-01T10:00:00.000Z',
  action: 'commit-classification.updated',
  entity: 'commit-classification',
  entityId: 'DEFRA/repo#42@abc1234',
  summary: 'Commit abc1234 re-classified',
  before: { classification: 'Copilot-assisted' },
  after: { classification: 'Human-authored' },
  actor: 'dashboard',
  ...overrides
})

const respond = (body) =>
  fetchMock.mockResponse(
    JSON.stringify({
      entries: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
      ...body
    })
  )

const lastUrl = () => fetchMock.mock.calls.at(-1)[0]
// jsdom drops the space before visually hidden text in accessible names.
const REFRESH = /^Refresh\s?audit log$/

const typeDate = async (legend, { day, month, year }) => {
  const group = within(screen.getByRole('group', { name: legend }))
  if (day) {
    await userEvent.type(group.getByLabelText('Day'), day)
  }
  if (month) {
    await userEvent.type(group.getByLabelText('Month'), month)
  }
  if (year) {
    await userEvent.type(group.getByLabelText('Year'), year)
  }
}

const apply = () =>
  userEvent.click(screen.getByRole('button', { name: 'Apply filter' }))

describe('#AuditLogPanel', () => {
  test('Should show the loading state on first load', () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)

    expect(screen.getByText('Loading Audit log')).toBeInTheDocument()
  })

  test('Should show the empty state when nothing has been audited', async () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)

    expect(
      await screen.findByText('No audited changes in this period.')
    ).toBeInTheDocument()
  })

  test('Should list each audited change in a GOV.UK table', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel projectSlug="alpha" />)

    const table = await screen.findByRole('table', {
      name: 'Audited changes, newest first'
    })

    expect(table).toHaveClass('govuk-table')
    expect(
      within(table).getByRole('rowheader', { name: /1 Feb 2026, \d+:00[ap]m/ })
    ).toBeInTheDocument()
    expect(within(table).getByText('Commit re-classified')).toBeInTheDocument()
    expect(
      within(table).getByText('classification: Human-authored')
    ).toBeInTheDocument()
  })

  test.each([
    ['persona-mapping.upserted', 'Persona assigned'],
    ['persona-mapping.deleted', 'Persona removed'],
    ['something.else', 'something.else']
  ])('Should label the %s action', async (action, label) => {
    respond({ entries: [entry({ action, after: null })], total: 1 })
    render(<AuditLogPanel projectSlug="alpha" />)

    const table = within(await screen.findByRole('table'))

    expect(table.getByText(label)).toBeInTheDocument()
    expect(table.getByText('—')).toBeInTheDocument()
  })

  test('Should format afternoon and midnight times', async () => {
    const pm = new Date(2026, 1, 1, 14, 5).toISOString()
    const midnight = new Date(2026, 1, 1, 0, 30).toISOString()
    respond({
      entries: [
        entry({ id: '1', occurredAt: pm }),
        entry({ id: '2', occurredAt: midnight })
      ],
      total: 2
    })
    render(<AuditLogPanel projectSlug="alpha" />)

    expect(await screen.findByText('1 Feb 2026, 2:05pm')).toBeInTheDocument()
    expect(screen.getByText('1 Feb 2026, 12:30am')).toBeInTheDocument()
  })

  test('Should request the first page with the default page size', async () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastUrl()).toBe('/api/projects/alpha/audit-logs?page=1&pageSize=25')
  })

  test('Should not paginate a single page', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel projectSlug="alpha" />)

    await screen.findByRole('table')
    expect(
      screen.queryByRole('navigation', { name: 'Audit log pages' })
    ).not.toBeInTheDocument()
  })

  test('Should page forwards with GOV.UK pagination', async () => {
    respond({ entries: [entry()], total: 30, totalPages: 3 })
    render(<AuditLogPanel projectSlug="alpha" />)

    const nav = within(
      await screen.findByRole('navigation', { name: 'Audit log pages' })
    )
    expect(nav.queryByRole('button', { name: /Previous/ })).toBeNull()
    expect(nav.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page'
    )

    await userEvent.click(nav.getByRole('button', { name: /^Next\s?page$/ }))

    await waitFor(() =>
      expect(lastUrl()).toBe(
        '/api/projects/alpha/audit-logs?page=2&pageSize=25'
      )
    )
  })

  test('Should follow the page the backend reports and page back', async () => {
    respond({ entries: [entry()], page: 5, total: 90, totalPages: 9 })
    render(<AuditLogPanel projectSlug="alpha" />)

    const nav = within(
      await screen.findByRole('navigation', { name: 'Audit log pages' })
    )
    expect(screen.getByText(/Page 5 of 9/)).toBeInTheDocument()
    expect(nav.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1',
      '⋯',
      '4',
      '5',
      '6',
      '⋯',
      '9'
    ])

    await userEvent.click(nav.getByRole('button', { name: 'Page 9' }))
    await waitFor(() => expect(lastUrl()).toMatch(/page=9&/))

    await userEvent.click(
      nav.getByRole('button', { name: /^Previous\s?page$/ })
    )
    await waitFor(() => expect(lastUrl()).toMatch(/page=4&/))
  })

  test('Should apply a date filter covering whole days', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel projectSlug="alpha" />)

    await typeDate('Date from', { day: '1', month: '2', year: '2026' })
    await typeDate('Date to', { day: '3', month: '2', year: '2026' })
    await apply()

    const from = new Date(2026, 1, 1).toISOString()
    const to = new Date(2026, 1, 3, 23, 59, 59, 999).toISOString()
    await waitFor(() =>
      expect(lastUrl()).toBe(
        `/api/projects/alpha/audit-logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&page=1&pageSize=25`
      )
    )
  })

  test('Should name the missing part of a date and focus the summary', async () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)

    await typeDate('Date from', { day: '1', year: '2026' })
    await apply()

    const link = screen.getByRole('link', {
      name: 'Date from must include a month'
    })
    expect(link).toHaveAttribute('href', '#audit-from-month')
    expect(link.closest('div[tabindex]')).toHaveFocus()
    expect(
      screen.getByLabelText('Month', { selector: '#audit-from-month' })
    ).toHaveClass('govuk-input--error')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('Should reject a date that does not exist', async () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)

    await typeDate('Date to', { day: '31', month: '2', year: '2026' })
    await apply()

    expect(
      screen.getByRole('link', { name: 'Date to must be a real date' })
    ).toHaveAttribute('href', '#audit-to-day')
  })

  test('Should reject a range that ends before it starts', async () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)

    await typeDate('Date from', { day: '2', month: '2', year: '2026' })
    await typeDate('Date to', { day: '1', month: '2', year: '2026' })
    await apply()

    expect(
      screen.getByRole('link', {
        name: 'Date to must be the same as or after date from'
      })
    ).toBeInTheDocument()
  })

  test('Should clear an applied filter', async () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)

    await typeDate('Date from', { day: '1', month: '2', year: '2026' })
    await apply()
    await waitFor(() => expect(lastUrl()).toMatch(/from=/))

    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }))

    await waitFor(() => expect(lastUrl()).not.toMatch(/from=/))
    expect(
      within(screen.getByRole('group', { name: 'Date from' })).getByLabelText(
        'Day'
      )
    ).toHaveValue('')
  })

  test('Should change the page size', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel projectSlug="alpha" />)

    await userEvent.selectOptions(
      screen.getByLabelText('Results per page'),
      '50'
    )

    await waitFor(() => expect(lastUrl()).toMatch(/pageSize=50/))
  })

  test('Should refresh on request', async () => {
    respond({})
    render(<AuditLogPanel projectSlug="alpha" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: REFRESH }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  test('Should report a failed load without internal detail and retry', async () => {
    fetchMock.mockResponse('', { status: 502 })
    render(<AuditLogPanel projectSlug="alpha" />)

    expect(
      await screen.findByText(
        'We could not load the audit log. Try again later.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/502/)).not.toBeInTheDocument()

    respond({ entries: [entry()], total: 1 })
    await userEvent.click(
      screen.getByRole('button', { name: 'Try again: Audit log' })
    )

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  test('Should keep the last page on screen when a refresh fails', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel projectSlug="alpha" />)
    await screen.findByRole('table')

    fetchMock.mockResponse('', { status: 502 })
    await userEvent.click(screen.getByRole('button', { name: REFRESH }))

    expect(
      await screen.findByText(/could not refresh the audit log/)
    ).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})

describe('#actorLabel', () => {
  test.each([
    ['dashboard', 'dashboard'],
    [{ oid: 'o1', name: 'Ada' }, 'Ada'],
    [{ oid: 'o1' }, 'o1'],
    [null, 'Unknown']
  ])('Should label %o as %s', (actor, label) => {
    expect(actorLabel(actor)).toBe(label)
  })
})
