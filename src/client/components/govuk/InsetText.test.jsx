import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { InsetText } from './InsetText.jsx'

describe('#InsetText', () => {
  test('Should render its content in the inset style', () => {
    render(<InsetText className="app-extra">Data is delayed</InsetText>)

    expect(screen.getByText('Data is delayed')).toHaveClass(
      'govuk-inset-text',
      'app-extra'
    )
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<InsetText>Data is delayed</InsetText>)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
