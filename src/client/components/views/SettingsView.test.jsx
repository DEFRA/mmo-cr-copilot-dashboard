import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { SettingsView } from './SettingsView'

// jsdom drops the space before visually hidden text in accessible names.
const changeButton = (handle) =>
  screen.getByRole('button', {
    name: new RegExp(`^Change\\s?persona for ${handle}$`)
  })
const deleteButton = (handle) =>
  screen.getByRole('button', {
    name: new RegExp(`^Delete\\s?persona mapping for ${handle}$`)
  })

const PROJECT = {
  slug: 'alpha',
  name: 'Alpha',
  type: 'ai-adopted'
}

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
        project={PROJECT}
        role="project-admin"
        mappings={MAPPINGS}
        status="success"
        onSave={vi.fn()}
        onRemove={vi.fn()}
        {...props}
      />
    )

  const mappingsTable = () =>
    within(
      screen.getByRole('table', { name: 'Persona mappings by GitHub handle' })
    )

  test('Should suggest unmapped project contributors for the handle', () => {
    renderSettings({
      contributors: ['ada', 'sarathk06', 'grace']
    })

    const input = screen.getByLabelText('GitHub handle')
    const list = document.getElementById(input.getAttribute('list'))
    expect([...list.options].map((o) => o.value)).toEqual(['ada', 'grace'])
  })

  test('Should offer no suggestion list when there are no contributors', () => {
    renderSettings()

    expect(screen.getByLabelText('GitHub handle')).not.toHaveAttribute('list')
  })

  const fillForm = async (handle, persona) => {
    if (handle) {
      await userEvent.type(screen.getByLabelText('GitHub handle'), handle)
    }
    if (persona) await userEvent.click(screen.getByLabelText(persona))
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }))
  }

  test('Should list every configured mapping with its persona as a row header', () => {
    renderSettings()
    const table = mappingsTable()

    expect(
      table.getByRole('rowheader', { name: 'jeevankuduvaravindran' })
    ).toBeInTheDocument()
    expect(table.getByText('DevOps Engineers')).toHaveClass('govuk-tag--blue')
    expect(table.getByText('QA Engineers')).toHaveClass('govuk-tag--green')
  })

  test('Should drop mappings with an unknown persona or handle', () => {
    renderSettings({
      mappings: [
        ...MAPPINGS,
        { githubHandle: 'mystery', persona: 'architect' },
        { persona: 'qa' }
      ]
    })

    expect(mappingsTable().queryByText('mystery')).not.toBeInTheDocument()
    expect(mappingsTable().getAllByRole('row')).toHaveLength(3)
  })

  test('Should offer only the mapped personas', () => {
    renderSettings()

    expect(
      within(screen.getByRole('group', { name: /Persona/ }))
        .getAllByRole('radio')
        .map((r) => r.value)
    ).toEqual(['developer', 'devops', 'qa'])
  })

  test('Should show the empty state when nothing is configured', () => {
    renderSettings({ mappings: [] })

    expect(screen.getByText('No mappings yet')).toBeInTheDocument()
  })

  test('Should show the loading state before mappings arrive', () => {
    renderSettings({ mappings: [], status: 'loading' })

    expect(screen.getByText('Loading Persona mappings')).toBeInTheDocument()
  })

  test('Should show a load error without internal detail', () => {
    renderSettings({ mappings: [], status: 'error', error: 'ECONNREFUSED' })

    expect(
      screen.getByText('We could not load persona mappings. Try again later.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument()
  })

  test('Should keep the last known mappings when a refresh fails', () => {
    renderSettings({ status: 'error' })

    expect(
      screen.getByText(/could not refresh persona mappings/)
    ).toBeInTheDocument()
    expect(mappingsTable().getByText('sarathk06')).toBeInTheDocument()
  })

  test('Should save a new mapping and confirm it in a success banner', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderSettings({ onSave })

    await fillForm('randhir-patel', 'QA Engineers')

    expect(onSave).toHaveBeenCalledWith('randhir-patel', 'qa')
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Persona mapping for randhir-patel saved')
    expect(banner).toHaveFocus()
    expect(screen.getByLabelText('GitHub handle')).toHaveValue('')
  })

  test('Should summarise every missing answer and focus the summary', async () => {
    const onSave = vi.fn()
    renderSettings({ onSave })

    await fillForm()

    const summary = screen
      .getByText('There is a problem')
      .closest('div[tabindex]')
    expect(summary).toHaveFocus()
    expect(
      within(summary).getByRole('link', { name: 'Enter a GitHub handle' })
    ).toHaveAttribute('href', '#github-handle')
    expect(
      within(summary).getByRole('link', { name: 'Select a persona' })
    ).toHaveAttribute('href', '#persona')
    expect(screen.getByLabelText('GitHub handle')).toHaveAttribute(
      'aria-describedby',
      'github-handle-hint github-handle-error'
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  test('Should reject an invalid handle without calling onSave', async () => {
    const onSave = vi.fn()
    renderSettings({ onSave })

    await fillForm('-bad', 'Developers')

    expect(
      screen.getAllByText(
        /must only include letters, numbers and single hyphens/
      )
    ).toHaveLength(2)
    expect(onSave).not.toHaveBeenCalled()
  })

  test('Should move focus to the field from the error summary', async () => {
    renderSettings()

    await fillForm()
    await userEvent.click(
      screen.getByRole('link', { name: 'Enter a GitHub handle' })
    )

    expect(screen.getByLabelText('GitHub handle')).toHaveFocus()
  })

  test('Should surface a save failure from the backend', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Handle already taken'))
    renderSettings({ onSave })

    await fillForm('octocat', 'Developers')

    expect(await screen.findAllByText('Handle already taken')).not.toHaveLength(
      0
    )
  })

  test('Should fall back to a generic message when a save fails silently', async () => {
    renderSettings({ onSave: vi.fn().mockRejectedValue(new Error('')) })

    await fillForm('octocat', 'Developers')

    expect(
      await screen.findAllByText('The mapping could not be saved')
    ).not.toHaveLength(0)
  })

  test('Should change an existing mapping', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderSettings({ onSave })

    await userEvent.click(changeButton('sarathk06'))

    expect(
      screen.getByRole('heading', { name: 'Change a Persona Mapping' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('GitHub handle')).toHaveValue('sarathk06')
    expect(screen.getByLabelText('QA Engineers')).toBeChecked()

    await userEvent.click(screen.getByLabelText('DevOps Engineers'))
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }))

    expect(onSave).toHaveBeenCalledWith('sarathk06', 'devops')
  })

  test('Should cancel a change', async () => {
    renderSettings()

    await userEvent.click(changeButton('sarathk06'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      screen.getByRole('heading', { name: 'Add a Persona Mapping' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('GitHub handle')).toHaveValue('')
  })

  test('Should ask for confirmation before deleting a mapping', async () => {
    const onRemove = vi.fn().mockResolvedValue()
    renderSettings({ onRemove })

    await userEvent.click(deleteButton('jeevankuduvaravindran'))

    const question = screen.getByRole('heading', {
      name: /Are you sure you want to delete the persona mapping for jeevankuduvaravindran/
    })
    expect(question).toHaveFocus()
    expect(onRemove).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete mapping' })
    )

    await waitFor(() =>
      expect(onRemove).toHaveBeenCalledWith('jeevankuduvaravindran')
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Persona mapping for jeevankuduvaravindran deleted'
    )
  })

  test('Should not delete when the confirmation is cancelled', async () => {
    const onRemove = vi.fn()
    renderSettings({ onRemove })

    await userEvent.click(deleteButton('sarathk06'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText(/Are you sure/)).not.toBeInTheDocument()
    expect(onRemove).not.toHaveBeenCalled()
  })

  test('Should report a failed delete', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('500'))
    renderSettings({ onRemove })

    await userEvent.click(deleteButton('sarathk06'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete mapping' })
    )

    expect(
      await screen.findByText(
        'The persona mapping for sarathk06 could not be deleted. Try again.'
      )
    ).toBeInTheDocument()
  })

  test('Should have no detectable accessibility violations on the audit log tab', async () => {
    const { container } = renderSettings({ tab: 'audit-log' })
    await screen.findByText('No audited changes in this period.')

    expect(await axeViolations(container)).toEqual([])
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = renderSettings()

    expect(await axeViolations(container)).toEqual([])
  })

  describe('By role', () => {
    test('Should show a project user only the audit log', () => {
      renderSettings({ role: 'project-user' })

      expect(
        screen.getByText(/You are a project user on Alpha/)
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Save mapping' })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Role Mappings' })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Connected Repositories' })
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /Audit Log/i })
      ).toBeInTheDocument()
    })

    test('Should not fetch repositories for a project user', () => {
      renderSettings({ role: 'project-user' })

      const urls = fetchMock.mock.calls.map(([url]) => String(url))
      expect(urls.some((url) => url.startsWith('/api/repositories'))).toBe(
        false
      )
    })

    test('Should open a project admin on persona mappings by default', () => {
      renderSettings()

      expect(
        screen.getByRole('button', { name: 'Save mapping' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Persona Mappings' })
      ).toHaveAttribute('aria-current', 'page')
      expect(
        screen.queryByRole('heading', { name: 'Audit Log' })
      ).not.toBeInTheDocument()
    })

    test('Should offer a project admin everything but role mappings', () => {
      renderSettings({ tab: 'roles' })

      expect(
        screen.getAllByRole('link').map((link) => link.textContent)
      ).toEqual(['Persona Mappings', 'Repositories', 'Audit Log'])
      expect(
        screen.getByRole('button', { name: 'Save mapping' })
      ).toBeInTheDocument()
    })

    test('Should show the repositories tab', () => {
      renderSettings({ tab: 'repositories' })

      expect(
        screen.getByRole('heading', { name: 'Connected Repositories' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Add a Repository' })
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Save mapping' })
      ).not.toBeInTheDocument()
    })

    test('Should show the roles tab to a dashboard admin only', () => {
      renderSettings({
        role: 'dashboard-admin',
        isDashboardAdmin: true,
        tab: 'roles'
      })

      expect(
        screen.getByRole('heading', { name: 'Role Mappings' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Role Mappings' })
      ).toHaveAttribute('aria-current', 'page')
    })

    test('Should show the audit log tab', async () => {
      renderSettings({ tab: 'audit-log' })

      expect(
        screen.getByRole('heading', { name: /Audit Log/i })
      ).toBeInTheDocument()
      await screen.findByText('No audited changes in this period.')
    })

    test('Should ask the page to change tab when a section is chosen', async () => {
      const onTabChange = vi.fn()
      renderSettings({ onTabChange })

      await userEvent.click(screen.getByRole('link', { name: 'Repositories' }))

      expect(onTabChange).toHaveBeenCalledWith('repositories')
    })

    test('Should show the caller’s role at the top right', () => {
      const { container } = renderSettings()

      const head = container.querySelector('.app-settings__head')
      expect(within(head).getByText('Your role')).toBeInTheDocument()
      expect(within(head).getByText('Project Admin')).toHaveClass(
        'govuk-tag--teal'
      )
    })

    test('Should treat a dashboard admin as one whatever the project role', () => {
      renderSettings({ role: 'project-user', isDashboardAdmin: true })

      expect(screen.getByText('Dashboard Admin')).toHaveClass(
        'govuk-tag--magenta'
      )
      expect(
        screen.getByRole('button', { name: 'Save mapping' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Role Mappings' })
      ).toBeInTheDocument()
    })

    test('Should give a project user only the audit log tab, whatever tab is asked for', () => {
      renderSettings({ role: 'project-user', tab: 'personas' })

      expect(screen.getAllByRole('link')).toHaveLength(1)
      expect(screen.getByRole('link', { name: 'Audit Log' })).toHaveAttribute(
        'aria-current',
        'page'
      )
      expect(screen.getByText('Project User')).toHaveClass('govuk-tag--grey')
      expect(
        screen.queryByRole('button', { name: 'Save mapping' })
      ).not.toBeInTheDocument()
    })

    test('Should treat a missing role as no administration rights', () => {
      renderSettings({ role: null })

      expect(
        screen.queryByRole('button', { name: 'Save mapping' })
      ).not.toBeInTheDocument()
    })

    test('Should keep a default mapping read-only', () => {
      renderSettings({
        mappings: [
          ...MAPPINGS,
          { githubHandle: 'olddefault', persona: 'qa', scope: 'default' }
        ]
      })

      expect(screen.getByText('Default for every project')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /persona for olddefault/ })
      ).not.toBeInTheDocument()
    })
  })
})
