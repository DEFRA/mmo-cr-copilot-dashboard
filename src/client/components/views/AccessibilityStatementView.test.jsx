import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { AccessibilityStatementView } from './AccessibilityStatementView.jsx'

describe('#AccessibilityStatementView', () => {
  test('Should render the main heading and key sections', () => {
    render(<AccessibilityStatementView />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Accessibility statement for Copilot Delivery Insights'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'How accessible this service is'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Compliance status' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Non-accessible content' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Feedback and contact information'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Enforcement procedure' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Preparation of this accessibility statement'
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '#overview'
    )
    expect(
      screen.getByRole('link', { name: 'mmo-cr-devops@defra.gov.uk' })
    ).toHaveAttribute('href', 'mailto:mmo-cr-devops@defra.gov.uk')
    expect(document.title).toBe(
      'Accessibility statement – Copilot Delivery Insights'
    )
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = render(<AccessibilityStatementView />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
