import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { SettingsSubNavigation, settingsTabsFor } from './SettingsSubNavigation'

const ids = (permissions) => settingsTabsFor(permissions).map((t) => t.id)

describe('#settingsTabsFor', () => {
  test.each([
    [{ canAdminister: false, isDashboardAdmin: false }, ['audit-log']],
    [
      { canAdminister: true, isDashboardAdmin: false },
      ['personas', 'repositories', 'audit-log']
    ],
    [
      { canAdminister: true, isDashboardAdmin: true },
      ['personas', 'repositories', 'roles', 'audit-log']
    ],
    [
      { canAdminister: true, isDashboardAdmin: false, jiraConnected: true },
      ['personas', 'repositories', 'jira-workflow', 'audit-log']
    ],
    [
      { canAdminister: true, isDashboardAdmin: true, jiraConnected: true },
      ['personas', 'repositories', 'jira-workflow', 'roles', 'audit-log']
    ],
    [
      { canAdminister: false, isDashboardAdmin: false, jiraConnected: true },
      ['audit-log']
    ]
  ])('Should offer the right tabs for %o', (permissions, expected) => {
    expect(ids(permissions)).toStrictEqual(expected)
  })

  test('Should label every tab in Title Case', () => {
    expect(
      settingsTabsFor({
        canAdminister: true,
        isDashboardAdmin: true,
        jiraConnected: true
      }).map((t) => t.label)
    ).toStrictEqual([
      'Persona Mappings',
      'Repositories',
      'JIRA',
      'Role Mappings',
      'Audit Log'
    ])
  })
})

describe('#SettingsSubNavigation', () => {
  const renderNav = (props = {}) =>
    render(
      <SettingsSubNavigation
        canAdminister
        isDashboardAdmin={false}
        activeTab="repositories"
        {...props}
      />
    )

  test('Should link each tab and mark the active one as the current page', () => {
    renderNav()

    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(nav).toHaveClass('moj-sub-navigation')
    expect(
      screen.getByRole('link', { name: 'Persona Mappings' })
    ).toHaveAttribute('href', '#/settings/personas')
    expect(screen.getByRole('link', { name: 'Repositories' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Audit Log' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  test('Should hide tabs the caller may not open', () => {
    renderNav({ canAdminister: false, activeTab: 'audit-log' })

    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Role Mappings' })).toBeNull()
  })

  test('Should link the JIRA tab only when the project uses Jira', () => {
    const { rerender } = renderNav()
    expect(screen.queryByRole('link', { name: 'JIRA' })).toBeNull()

    rerender(
      <SettingsSubNavigation
        canAdminister
        isDashboardAdmin={false}
        jiraConnected
        activeTab="jira-workflow"
      />
    )

    const link = screen.getByRole('link', { name: 'JIRA' })
    expect(link).toHaveAttribute('href', '#/settings/jira-workflow')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  test('Should hand a plain click to onNavigate instead of following the link', async () => {
    const onNavigate = vi.fn()
    renderNav({ onNavigate })

    await userEvent.click(screen.getByRole('link', { name: 'Audit Log' }))

    expect(onNavigate).toHaveBeenCalledWith('audit-log')
  })

  test('Should leave a modified click to the browser', async () => {
    const onNavigate = vi.fn()
    renderNav({ onNavigate })

    fireEvent.click(screen.getByRole('link', { name: 'Audit Log' }), {
      ctrlKey: true
    })

    expect(onNavigate).not.toHaveBeenCalled()
  })

  test('Should still render links with no onNavigate', async () => {
    renderNav()

    await userEvent.click(screen.getByRole('link', { name: 'Audit Log' }))

    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument()
  })

  test('Should have no axe violations', async () => {
    const { container } = renderNav({ isDashboardAdmin: true })

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
