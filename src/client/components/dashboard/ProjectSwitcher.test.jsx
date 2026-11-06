import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProjectSwitcher } from './ProjectSwitcher.jsx'

const projects = [
  { slug: 'proj-1', name: 'Project One', type: 'ai-adopted' },
  { slug: 'proj-2', name: 'Project Two', type: 'ai-native' }
]

const renderSwitcher = (props = {}) =>
  render(
    <ProjectSwitcher
      projects={projects}
      activeProject={projects[0]}
      {...props}
    />
  )

const toggle = () => screen.getByRole('button', { name: /Project One/ })

describe('#ProjectSwitcher', () => {
  test('Should name the toggle with the project type and name, as in the mock-up', () => {
    renderSwitcher()

    expect(toggle()).toHaveAccessibleName('AI-Adopted Project: Project One')
    expect(toggle()).toHaveClass('app-switcher')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  test('Should mark an AI-Native project with the native tag', () => {
    renderSwitcher({ activeProject: projects[1] })

    expect(screen.getByText('AI-Native')).toHaveClass(
      'app-switcher__type',
      'app-switcher__type--native'
    )
  })

  test('Should list every project when opened', async () => {
    renderSwitcher()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await userEvent.click(toggle())

    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('option', { name: /Project One/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: /Project Two/ })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  test('Should select a project and close', async () => {
    const onSelectProject = vi.fn()
    renderSwitcher({ onSelectProject })

    await userEvent.click(toggle())
    await userEvent.click(screen.getByRole('option', { name: /Project Two/ }))

    expect(onSelectProject).toHaveBeenCalledWith('proj-2')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  test('Should close on Escape and return focus to the toggle', async () => {
    renderSwitcher()

    await userEvent.click(toggle())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(toggle()).toHaveFocus()
  })

  test('Should offer project management only when allowed', async () => {
    const onManageProjects = vi.fn()
    const { unmount } = renderSwitcher()
    await userEvent.click(toggle())
    expect(
      screen.queryByRole('link', { name: 'Manage projects' })
    ).not.toBeInTheDocument()
    unmount()

    renderSwitcher({ onManageProjects })
    await userEvent.click(toggle())
    await userEvent.click(screen.getByRole('link', { name: 'Manage projects' }))

    expect(onManageProjects).toHaveBeenCalled()
  })
})
