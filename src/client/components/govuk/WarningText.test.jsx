import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { WarningText } from './WarningText.jsx'

describe('#WarningText', () => {
  test('Should prefix the warning for screen readers and hide the icon', () => {
    const { container } = render(
      <WarningText>Only admins can change this</WarningText>
    )

    expect(
      screen.getByText('Only admins can change this', { exact: false })
    ).toHaveTextContent('WarningOnly admins can change this')
    expect(
      container.querySelector('.govuk-warning-text__icon')
    ).toHaveAttribute('aria-hidden', 'true')
  })

  test('Should use custom fallback text', () => {
    render(<WarningText iconFallbackText="Important">Read this</WarningText>)

    expect(screen.getByText('Important')).toHaveClass('govuk-visually-hidden')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<WarningText>Read this</WarningText>)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
