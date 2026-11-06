import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { TaskList } from './TaskList.jsx'

const ITEMS = [
  {
    title: 'Project Details',
    href: '#/details',
    hint: 'Name, slug and type',
    status: { text: 'Completed', tag: true, colour: 'green' }
  },
  {
    title: 'Connect Repositories',
    href: '#/repositories',
    status: { text: 'Not started', tag: true, colour: 'blue' }
  },
  {
    title: 'Review',
    status: { text: 'Cannot start yet' }
  }
]

describe('#TaskList', () => {
  test('Should render each task as a list item with the GOV.UK classes', () => {
    const { container } = render(<TaskList items={ITEMS} />)

    expect(container.querySelector('ul')).toHaveClass('govuk-task-list')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    const [linked, , blocked] = screen.getAllByRole('listitem')
    expect(linked).toHaveClass(
      'govuk-task-list__item',
      'govuk-task-list__item--with-link'
    )
    expect(blocked).not.toHaveClass('govuk-task-list__item--with-link')
  })

  test('Should link a task and describe it by its hint and status', () => {
    render(<TaskList items={ITEMS} />)

    const link = screen.getByRole('link', { name: 'Project Details' })
    expect(link).toHaveClass('govuk-link', 'govuk-task-list__link')
    expect(link).toHaveAttribute('href', '#/details')
    expect(link).toHaveAccessibleDescription('Name, slug and type Completed')
    expect(screen.getByText('Name, slug and type')).toHaveClass(
      'govuk-task-list__hint'
    )
  })

  test('Should describe a task with no hint by its status alone', () => {
    render(<TaskList items={ITEMS} />)

    expect(
      screen.getByRole('link', { name: 'Connect Repositories' })
    ).toHaveAccessibleDescription('Not started')
  })

  test('Should show a tagged status as a coloured tag', () => {
    render(<TaskList items={ITEMS} />)

    expect(screen.getByText('Completed')).toHaveClass(
      'govuk-tag',
      'govuk-tag--green'
    )
  })

  test('Should show an untagged status as plain greyed text without a link', () => {
    render(<TaskList items={ITEMS} />)

    const blocked = screen.getAllByRole('listitem')[2]
    expect(within(blocked).queryByRole('link')).not.toBeInTheDocument()
    expect(within(blocked).getByText('Review')).toBeInTheDocument()
    const status = within(blocked).getByText('Cannot start yet')
    expect(status).toHaveClass(
      'govuk-task-list__status',
      'govuk-task-list__status--cannot-start-yet'
    )
    expect(status.querySelector('.govuk-tag')).toBeNull()
  })

  test('Should call onClick for a task link', async () => {
    const onClick = vi.fn((event) => event.preventDefault())
    render(
      <TaskList
        items={[
          { title: 'Open', href: '#/open', onClick, status: { text: 'Ready' } }
        ]}
      />
    )

    await userEvent.click(screen.getByRole('link', { name: 'Open' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('Should use a given id prefix and extra class', () => {
    const { container } = render(
      <TaskList items={ITEMS} idPrefix="tasks" className="app-extra" />
    )

    expect(container.querySelector('ul')).toHaveClass('app-extra')
    expect(container.querySelector('#tasks-0-status')).not.toBeNull()
    expect(container.querySelector('#tasks-0-hint')).not.toBeNull()
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = render(<TaskList items={ITEMS} />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
