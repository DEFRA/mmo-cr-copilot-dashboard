import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { CookiesView } from './CookiesView.jsx'
import { PrivacyView } from './PrivacyView.jsx'

describe('#CookiesView', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="root" data-session-cookie-name="dash-session" data-session-cookie-ttl-hours="4"></div>'
  })

  test('Should list only the essential session cookie', () => {
    render(<CookiesView onBack={() => {}} />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Cookies' })
    ).toBeInTheDocument()
    expect(document.title).toBe('Cookies – Copilot Delivery Insights')
    const table = screen.getByRole('table', {
      name: 'Essential cookies used by this service'
    })
    expect(table).toHaveTextContent('dash-session')
    expect(table).toHaveTextContent('Keeps you signed in')
    expect(table).toHaveTextContent('4 hours')
    expect(screen.getByText(/do not ask for your consent/)).toBeInTheDocument()
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = render(<CookiesView onBack={() => {}} />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#PrivacyView', () => {
  test('Should explain the data collected and hold the DPIA sections', () => {
    render(<PrivacyView onBack={() => {}} />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy' })
    ).toBeInTheDocument()
    expect(document.title).toBe('Privacy – Copilot Delivery Insights')
    expect(screen.getByText(/is the\s+data controller/)).toBeInTheDocument()
    expect(
      screen.getByText(/will be confirmed by the Defra data protection team/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = render(<PrivacyView onBack={() => {}} />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
