import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Breadcrumb } from './Breadcrumb.jsx'

const items = [
  { key: 'overview', label: 'Overview' },
  { key: 'repo', label: 'mmo-cr-copilot-dashboard' },
  { key: 'pr', label: 'PR 42' }
]

describe('#Breadcrumb', () => {
  test('Should mark the final crumb as the current page', () => {
    render(<Breadcrumb items={items} onNavigate={vi.fn()} />)

    expect(screen.getByText('PR 42')).toHaveAttribute('aria-current', 'page')
  })

  test('Should expose the trail as a labelled navigation landmark', () => {
    render(<Breadcrumb items={items} onNavigate={vi.fn()} />)

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    ).toBeInTheDocument()
  })

  test('Should navigate when an ancestor crumb is activated', async () => {
    const onNavigate = vi.fn()
    render(<Breadcrumb items={items} onNavigate={onNavigate} />)

    await userEvent.click(screen.getByRole('button', { name: 'Overview' }))

    expect(onNavigate).toHaveBeenCalledWith(items[0])
  })

  test('Should offer a back shortcut to the parent level', async () => {
    const onNavigate = vi.fn()
    render(<Breadcrumb items={items} onNavigate={onNavigate} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Back to mmo-cr-copilot-dashboard' })
    )

    expect(onNavigate).toHaveBeenCalledWith(items[1])
  })

  test('Should offer a home shortcut once more than two levels deep', async () => {
    const onNavigate = vi.fn()
    render(<Breadcrumb items={items} onNavigate={onNavigate} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Go to home overview' })
    )

    expect(onNavigate).toHaveBeenCalledWith(items[0])
  })

  test('Should hide the quick navigation at the root level', () => {
    render(<Breadcrumb items={[items[0]]} onNavigate={vi.fn()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
