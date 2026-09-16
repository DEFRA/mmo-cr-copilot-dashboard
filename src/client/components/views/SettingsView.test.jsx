import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SettingsView } from './SettingsView'

const MAPPINGS = [
  { githubHandle: 'jeevankuduvaravindran', persona: 'devops' },
  { githubHandle: 'sarathk06', persona: 'qa' }
]

describe('#SettingsView', () => {
  // The page also renders the audit log, which fetches on mount.
  beforeEach(() => {
    fetchMock.mockResponse(
      JSON.stringify({
        entries: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1
      })
    )
  })

  const renderSettings = (props = {}) =>
    render(
      <SettingsView
        mappings={MAPPINGS}
        status="success"
        error={null}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        {...props}
      />
    )

  test('Should list every configured mapping with its role', () => {
    renderSettings()
    const table = within(screen.getByRole('table'))

    expect(table.getByText('jeevankuduvaravindran')).toBeInTheDocument()
    expect(table.getByText('sarathk06')).toBeInTheDocument()
    expect(table.getByText('DevOps Engineers')).toBeInTheDocument()
    expect(table.getByText('QA Engineers')).toBeInTheDocument()
  })

  test('Should show an empty message when nothing is configured', () => {
    renderSettings({ mappings: [] })

    expect(
      screen.getByText(/every contributor defaults to Developers/)
    ).toBeInTheDocument()
  })

  test('Should surface a load error', () => {
    renderSettings({ mappings: [], status: 'error', error: 'offline' })

    expect(screen.getByRole('alert')).toHaveTextContent('offline')
  })

  test('Should submit a new mapping', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderSettings({ onSave })

    await userEvent.type(
      screen.getByPlaceholderText('e.g. octocat'),
      'randhir-patel'
    )
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'qa')
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('randhir-patel', 'qa')
    )
  })

  test('Should reject an invalid handle without calling onSave', async () => {
    const onSave = vi.fn()
    renderSettings({ onSave })

    await userEvent.type(screen.getByPlaceholderText('e.g. octocat'), '-bad')
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'valid GitHub handle'
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  test('Should surface a save failure from the backend', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Handle already taken'))
    renderSettings({ onSave })

    await userEvent.type(screen.getByPlaceholderText('e.g. octocat'), 'octocat')
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Handle already taken'
    )
  })

  test('Should remove a mapping', async () => {
    const onRemove = vi.fn().mockResolvedValue()
    renderSettings({ onRemove })

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    await waitFor(() =>
      expect(onRemove).toHaveBeenCalledWith('jeevankuduvaravindran')
    )
  })
})
