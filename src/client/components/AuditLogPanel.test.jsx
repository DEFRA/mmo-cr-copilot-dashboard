import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AuditLogPanel } from './AuditLogPanel'

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

describe('#AuditLogPanel', () => {
  test('Should show a message when nothing has been audited', async () => {
    respond({})
    render(<AuditLogPanel />)

    expect(
      await screen.findByText('No audited changes in this time window.')
    ).toBeInTheDocument()
  })

  test('Should list each audited change with its before and after values', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel />)

    const table = within(await screen.findByRole('table'))

    expect(table.getByText('Commit re-classified')).toBeInTheDocument()
    expect(table.getByText('DEFRA/repo#42@abc1234')).toBeInTheDocument()
    expect(
      table.getByText('classification: Copilot-assisted')
    ).toBeInTheDocument()
    expect(
      table.getByText('classification: Human-authored')
    ).toBeInTheDocument()
  })

  test('Should render a removal, which has no after value', async () => {
    respond({
      entries: [entry({ action: 'persona-mapping.deleted', after: null })],
      total: 1
    })
    render(<AuditLogPanel />)

    const table = within(await screen.findByRole('table'))

    expect(table.getByText('Role removed')).toBeInTheDocument()
    expect(table.getByText('—')).toBeInTheDocument()
  })

  test('Should request the first page with the default page size', async () => {
    respond({})
    render(<AuditLogPanel />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastUrl()).toBe('/api/audit-logs?page=1&pageSize=25')
  })

  test('Should request the next page', async () => {
    respond({ entries: [entry()], total: 3, totalPages: 3 })
    render(<AuditLogPanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Next' }))

    await waitFor(() =>
      expect(lastUrl()).toBe('/api/audit-logs?page=2&pageSize=25')
    )
  })

  test('Should follow the page the backend reports', async () => {
    respond({ entries: [entry()], page: 2, total: 3, totalPages: 3 })
    render(<AuditLogPanel />)

    expect(
      await screen.findByRole('button', { name: 'Previous' })
    ).toBeEnabled()
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument()
  })

  test('Should not offer a previous page on the first page', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel />)

    expect(
      await screen.findByRole('button', { name: 'Previous' })
    ).toBeDisabled()
  })

  test('Should apply a datetime window and reset to the first page', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel />)

    await userEvent.type(
      await screen.findByLabelText('From'),
      '2026-02-01T09:00'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(lastUrl()).toMatch(/from=2026-02-01T/))
    expect(lastUrl()).toMatch(/page=1/)
  })

  test('Should reject a window that ends before it starts', async () => {
    respond({})
    render(<AuditLogPanel />)

    await userEvent.type(
      await screen.findByLabelText('From'),
      '2026-02-02T09:00'
    )
    await userEvent.type(screen.getByLabelText('To'), '2026-02-01T09:00')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'From must be before To'
    )
  })

  test('Should clear an applied window', async () => {
    respond({})
    render(<AuditLogPanel />)

    await userEvent.type(
      await screen.findByLabelText('From'),
      '2026-02-01T09:00'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastUrl()).toMatch(/from=/))

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await waitFor(() => expect(lastUrl()).not.toMatch(/from=/))
  })

  test('Should change the page size', async () => {
    respond({ entries: [entry()], total: 1 })
    render(<AuditLogPanel />)

    await userEvent.selectOptions(
      await screen.findByLabelText('Per page'),
      '50'
    )

    await waitFor(() => expect(lastUrl()).toMatch(/pageSize=50/))
  })

  test('Should report a failed load', async () => {
    fetchMock.mockResponse('', { status: 502 })
    render(<AuditLogPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load the audit log"
    )
  })
})
