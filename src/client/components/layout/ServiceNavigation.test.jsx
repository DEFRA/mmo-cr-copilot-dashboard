import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { wideViewport } from '#/test-helpers/viewport.js'
import { ServiceNavigation } from './ServiceNavigation.jsx'

const ITEMS = [
  { id: 'overview', label: 'Overview', href: '#/overview' },
  { id: 'settings', label: 'Settings', href: '#/settings' }
]

const renderNavigation = (props = {}) =>
  render(
    <ServiceNavigation
      serviceName="Copilot Delivery Insights"
      serviceHref="#/overview"
      items={ITEMS}
      activeId="overview"
      {...props}
    />
  )

describe('#ServiceNavigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('On a wide screen', () => {
    beforeEach(() => {
      vi.spyOn(window, 'matchMedia').mockImplementation(wideViewport)
    })

    test('Should link the service name', () => {
      renderNavigation()

      expect(
        screen.getByRole('link', { name: 'Copilot Delivery Insights' })
      ).toHaveAttribute('href', '#/overview')
    })

    test('Should mark only the active item as the current page', () => {
      renderNavigation({ activeId: 'settings' })

      expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
        'aria-current',
        'page'
      )
      expect(
        screen.getByRole('link', { name: 'Overview' })
      ).not.toHaveAttribute('aria-current')
    })

    test('Should hide the menu toggle and show the items', () => {
      renderNavigation()

      expect(
        screen.queryByRole('button', { name: 'Menu' })
      ).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Overview' })).toBeVisible()
    })

    test('Should report the chosen item', async () => {
      const onNavigate = vi.fn()
      renderNavigation({ onNavigate })

      await userEvent.click(screen.getByRole('link', { name: 'Settings' }))

      expect(onNavigate).toHaveBeenCalledWith('settings')
    })
  })

  describe('On a narrow screen', () => {
    test('Should collapse the items behind a menu toggle', async () => {
      renderNavigation()

      const toggle = screen.getByRole('button', { name: 'Menu' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(
        screen.queryByRole('link', { name: 'Overview' })
      ).not.toBeInTheDocument()

      await userEvent.click(toggle)

      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('link', { name: 'Overview' })).toBeVisible()
      expect(
        document.getElementById(toggle.getAttribute('aria-controls'))
      ).not.toHaveAttribute('hidden')
    })

    test('Should not collapse a single item', () => {
      renderNavigation({ items: ITEMS.slice(0, 1) })

      expect(
        screen.queryByRole('button', { name: 'Menu' })
      ).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Overview' })).toBeVisible()
    })
  })
})
