import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Pagination } from './Pagination.jsx'

describe('#Pagination', () => {
  test('Should link pages and mark the current one', () => {
    render(
      <Pagination
        previous={{ href: '?page=1' }}
        next={{ href: '?page=3' }}
        items={[
          { number: 1, href: '?page=1' },
          { number: 2, href: '?page=2', current: true },
          { ellipsis: true },
          { number: 9, href: '?page=9' }
        ]}
      />
    )

    expect(
      screen.getByRole('navigation', { name: 'Pagination' })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Page 1' })).not.toHaveAttribute(
      'aria-current'
    )
    expect(
      screen.getByRole('link', { name: /^Previous\s?page$/ })
    ).toHaveAttribute('rel', 'prev')
    expect(screen.getByRole('link', { name: /^Next\s?page$/ })).toHaveAttribute(
      'rel',
      'next'
    )
    expect(screen.getByText('⋯')).toHaveClass(
      'govuk-pagination__item--ellipsis'
    )
  })

  test('Should use buttons when there is no URL', async () => {
    const onPage = vi.fn()
    const onNext = vi.fn()
    render(
      <Pagination
        next={{ onClick: onNext }}
        items={[
          { number: 1, current: true, onClick: () => onPage(1) },
          { number: 2, onClick: () => onPage(2) }
        ]}
      />
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))
    await userEvent.click(screen.getByRole('button', { name: /^Next\s?page$/ }))

    expect(onPage).toHaveBeenCalledWith(2)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  test('Should use the block layout with labels when there are no items', () => {
    render(
      <Pagination
        landmarkLabel="Results"
        previous={{
          href: '#a',
          text: 'Previous sprint',
          labelText: 'Sprint 7'
        }}
        next={{ href: '#b' }}
      />
    )

    const nav = screen.getByRole('navigation', { name: 'Results' })
    expect(nav).toHaveClass('govuk-pagination--block')
    expect(
      screen.getByRole('link', { name: /^Previous sprint\s*:\s*Sprint 7$/ })
    ).toBeInTheDocument()
    expect(screen.getByText('Next', { exact: false })).toHaveClass(
      'govuk-pagination__link-title--decorated'
    )
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <Pagination
        previous={{ href: '#1' }}
        items={[{ number: 2, href: '#2', current: true }]}
      />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
