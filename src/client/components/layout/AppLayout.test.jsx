import { render, screen, within } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { AppLayout } from './AppLayout.jsx'
import { Hero } from './Hero.jsx'

const renderLayout = (props = {}) =>
  render(
    <AppLayout
      serviceName="Copilot Delivery Insights"
      projectName="MMO Catch Recording"
      navigation={<nav aria-label="Menu" />}
      hero={<Hero serviceName="Service" heading="Overview" />}
      {...props}
    >
      <p>View content</p>
    </AppLayout>
  )

describe('#AppLayout', () => {
  test('Should render the banner, main and footer landmarks', () => {
    renderLayout()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Maintained by the MMO Catch Recording team at Defra.'
    )
    expect(
      within(screen.getByRole('main')).getByText('View content')
    ).toBeInTheDocument()
  })

  test('Should make main the focusable skip-link target', () => {
    renderLayout()

    const main = screen.getByRole('main')

    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  test('Should show the signed-in user and a sign-out link', () => {
    renderLayout({ user: { name: 'Dev Admin' } })
    const banner = within(screen.getByRole('banner'))

    expect(banner.getByText('DA')).toHaveAttribute('aria-hidden', 'true')
    expect(banner.getByText('Signed in as Dev Admin')).toHaveClass(
      'govuk-visually-hidden'
    )
    expect(banner.getByRole('link', { name: 'Sign out' })).toHaveAttribute(
      'href',
      '/logout'
    )
  })

  test('Should hide the sign-out link without a user', () => {
    renderLayout()

    expect(
      screen.queryByRole('link', { name: 'Sign out' })
    ).not.toBeInTheDocument()
  })

  test('Should brand the header and footer for Defra, not GOV.UK', () => {
    const { container } = renderLayout()
    const banner = screen.getByRole('banner')

    const logo = banner.querySelector('img.defra-header__logo')
    expect(logo).toHaveAttribute('src', '/public/images/defra-logo.svg')
    expect(logo).toHaveAttribute('alt', '')
    expect(
      within(banner).getByRole('link', {
        name: 'Department for Environment, Food and Rural Affairs: Copilot Delivery Insights'
      })
    ).toHaveAttribute('href', '#/overview')
    expect(banner).not.toHaveTextContent('Marine Management Organisation')
    expect(
      container.querySelector(
        '.govuk-header, .govuk-generic-header, .govuk-footer'
      )
    ).toBeNull()

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent('Open Government Licence v3.0')
    expect(footer).not.toHaveTextContent('Crown copyright')
    for (const name of ['Accessibility statement', 'Privacy', 'Cookies']) {
      expect(within(footer).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  test('Should leave the tools slot out without a switcher or user', () => {
    const { container } = renderLayout()

    expect(container.querySelector('.defra-header__tools')).toBeNull()
  })

  test('Should not render a decorative band under the navigation', () => {
    const { container } = renderLayout()

    expect(container.querySelector('.app-stripe')).toBeNull()
    expect(container.querySelector('.app-service-nav')).toBeNull()
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = renderLayout()

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
