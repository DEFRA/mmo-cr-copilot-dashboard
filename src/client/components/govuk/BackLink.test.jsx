import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { BackLink } from './BackLink.jsx'

describe('#BackLink', () => {
  test('Should render a back link by default', () => {
    render(<BackLink />)

    const link = screen.getByRole('link', { name: 'Back' })
    expect(link).toHaveAttribute('href', '#')
    expect(link).toHaveClass('govuk-back-link')
  })

  test('Should accept a destination, text and click handler', async () => {
    const onClick = vi.fn((event) => event.preventDefault())
    render(
      <BackLink href="#/overview" onClick={onClick}>
        Back to overview
      </BackLink>
    )

    const link = screen.getByRole('link', { name: 'Back to overview' })
    expect(link).toHaveAttribute('href', '#/overview')

    await userEvent.click(link)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<BackLink />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
