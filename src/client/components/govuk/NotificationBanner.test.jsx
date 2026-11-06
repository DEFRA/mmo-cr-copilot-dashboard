import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { NotificationBanner } from './NotificationBanner.jsx'

describe('#NotificationBanner', () => {
  test('Should be a region named by its default title', () => {
    render(<NotificationBanner>Live updates paused.</NotificationBanner>)

    const banner = screen.getByRole('region', { name: 'Important' })
    expect(banner).toHaveTextContent('Live updates paused.')
    expect(screen.getByText('Live updates paused.')).toHaveClass(
      'govuk-notification-banner__heading'
    )
    expect(banner).not.toHaveFocus()
  })

  test('Should render rich content and a custom heading level', () => {
    render(
      <NotificationBanner title="Service status" headingLevel={3}>
        <p className="govuk-body">Retrying</p>
      </NotificationBanner>
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'Service status' })
    ).toBeInTheDocument()
    expect(screen.getByText('Retrying')).toHaveClass('govuk-body')
  })

  test('Should be an alert for success and not take focus by default', () => {
    render(<NotificationBanner type="success">Saved</NotificationBanner>)

    const banner = screen.getByRole('alert', { name: 'Success' })
    expect(banner).toHaveClass('govuk-notification-banner--success')
    expect(banner).not.toHaveFocus()
  })

  test('Should take focus for success when asked', () => {
    render(
      <NotificationBanner type="success" autoFocus>
        Saved
      </NotificationBanner>
    )

    expect(screen.getByRole('alert', { name: 'Success' })).toHaveFocus()
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <NotificationBanner>Live updates paused.</NotificationBanner>
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
