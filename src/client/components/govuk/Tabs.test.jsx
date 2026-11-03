import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Tabs } from './Tabs.jsx'

const ITEMS = [
  { id: 'repos', label: 'Repositories', panel: <p>Repository panel</p> },
  { id: 'prs', label: 'Pull requests', panel: <p>Pull request panel</p> },
  { id: 'people', label: 'Contributors', panel: <p>Contributor panel</p> }
]

const tab = (name) => screen.getByRole('tab', { name })

describe('#Tabs', () => {
  test('Should select the first tab and name its panel from it', () => {
    render(<Tabs items={ITEMS} />)

    expect(screen.getByRole('tablist', { name: 'Contents' })).toBeVisible()
    expect(tab('Repositories')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Repositories')).toHaveAttribute('tabindex', '0')
    expect(tab('Pull requests')).toHaveAttribute('tabindex', '-1')
    expect(
      screen.getByRole('tabpanel', { name: 'Repositories' })
    ).toHaveTextContent('Repository panel')
    expect(screen.queryByText('Pull request panel')).not.toBeVisible()
  })

  test('Should honour a default selection and select on click', async () => {
    const onChange = vi.fn()
    render(<Tabs items={ITEMS} defaultSelectedId="prs" onChange={onChange} />)

    expect(tab('Pull requests')).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(tab('Contributors'))

    expect(tab('Contributors')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Contributors' })).toBeVisible()
    expect(onChange).toHaveBeenCalledWith('people')
  })

  test('Should move focus and selection with the arrow, Home and End keys', async () => {
    render(<Tabs items={ITEMS} />)
    tab('Repositories').focus()

    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Pull requests')).toHaveFocus()
    expect(tab('Pull requests')).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{End}')
    expect(tab('Contributors')).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Repositories')).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(tab('Contributors')).toHaveFocus()

    await userEvent.keyboard('{Home}')
    expect(tab('Repositories')).toHaveFocus()
    expect(tab('Repositories')).toHaveAttribute('aria-selected', 'true')
  })

  test('Should ignore other keys', async () => {
    const onChange = vi.fn()
    render(<Tabs items={ITEMS} onChange={onChange} />)
    tab('Repositories').focus()

    await userEvent.keyboard('{ArrowDown}')

    expect(onChange).not.toHaveBeenCalled()
    expect(tab('Repositories')).toHaveFocus()
  })

  test('Should fall back to the first tab when the selection disappears', () => {
    const { rerender } = render(<Tabs items={ITEMS} defaultSelectedId="prs" />)

    rerender(<Tabs items={[ITEMS[0], ITEMS[2]]} defaultSelectedId="prs" />)

    expect(tab('Repositories')).toHaveAttribute('aria-selected', 'true')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<Tabs title="Breakdowns" items={ITEMS} />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
