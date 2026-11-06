import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Details } from './Details.jsx'

describe('#Details', () => {
  test('Should start collapsed and expand from its summary', async () => {
    render(<Details summary="Data and description">Figure 1 data</Details>)

    const details = screen.getByRole('group')
    expect(details).not.toHaveAttribute('open')

    await userEvent.click(screen.getByText('Data and description'))

    expect(details).toHaveAttribute('open')
  })

  test('Should start open when asked', () => {
    render(
      <Details summary="Help" open>
        Text
      </Details>
    )

    expect(screen.getByRole('group')).toHaveAttribute('open')
    expect(screen.getByText('Text')).toHaveClass('govuk-details__text')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<Details summary="Help">Text</Details>)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
