import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Breadcrumbs } from './Breadcrumbs.jsx'

const ITEMS = [
  { id: 'project', label: 'Catch Recording', href: '#/overview' },
  { id: 'repo', label: 'mmo-cr-api', href: '#/repo/api' },
  { id: 'pr', label: 'Pull request 412' }
]

describe('#Breadcrumbs', () => {
  test('Should be a named navigation landmark', () => {
    render(<Breadcrumbs items={ITEMS} />)

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    ).toBeInTheDocument()
  })

  test('Should link earlier items and mark the last as the current page', () => {
    render(<Breadcrumbs items={ITEMS} />)

    expect(
      screen.getByRole('link', { name: 'Catch Recording' })
    ).toHaveAttribute('href', '#/overview')
    expect(
      screen.queryByRole('link', { name: 'Pull request 412' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Pull request 412')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  test('Should report the chosen item instead of following the hash', async () => {
    const onNavigate = vi.fn()
    render(<Breadcrumbs items={ITEMS} onNavigate={onNavigate} />)
    const before = window.location.hash

    await userEvent.click(screen.getByRole('link', { name: 'mmo-cr-api' }))

    expect(onNavigate).toHaveBeenCalledWith(ITEMS[1])
    expect(window.location.hash).toBe(before)
  })

  test('Should follow the hash without a callback', async () => {
    render(<Breadcrumbs items={ITEMS} collapseOnMobile />)

    await userEvent.click(screen.getByRole('link', { name: 'mmo-cr-api' }))

    expect(window.location.hash).toBe('#/repo/api')
    expect(screen.getByRole('navigation')).toHaveClass(
      'govuk-breadcrumbs--collapse-on-mobile'
    )
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<Breadcrumbs items={ITEMS} />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
