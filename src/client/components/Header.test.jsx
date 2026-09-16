import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Header } from './Header.jsx'

const liveFilter = {
  mode: 'live',
  start: null,
  end: null,
  label: 'This sprint'
}

const renderHeader = (props = {}) =>
  render(
    <Header
      theme="dark"
      onToggleTheme={vi.fn()}
      filter={liveFilter}
      presets={[]}
      onGoLive={vi.fn()}
      onApplyRange={vi.fn()}
      {...props}
    />
  )

describe('#Header', () => {
  test('Should render the service title as the page heading', () => {
    renderHeader()

    expect(
      screen.getByRole('heading', {
        name: 'MMO Catch Recording Code Delivery Insights'
      })
    ).toBeInTheDocument()
  })

  test('Should keep the decorative analytics logo out of the accessible name', () => {
    renderHeader()

    const logo = screen.getByTestId('header-logo')

    expect(logo).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(logo).toHaveAttribute('src', expect.stringContaining('logo-dark'))
  })

  test('Should use the light-theme logo when the light theme is selected', () => {
    renderHeader({ theme: 'light' })

    expect(screen.getByTestId('header-logo')).toHaveAttribute(
      'src',
      expect.not.stringContaining('logo-dark')
    )
  })

  test('Should convey the live status with text, not colour alone', () => {
    renderHeader({ connection: 'live' })

    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  test('Should say when the feed is reconnecting', () => {
    renderHeader({ connection: 'reconnecting' })

    expect(screen.getByText('Live · reconnecting')).toBeInTheDocument()
  })

  test('Should not make the live badge clickable while already live', () => {
    renderHeader()

    expect(
      screen.queryByRole('button', { name: /Custom range/ })
    ).not.toBeInTheDocument()
  })

  test('Should offer a way back to live from a custom range', async () => {
    const onGoLive = vi.fn()
    renderHeader({
      filter: { ...liveFilter, mode: 'custom' },
      onGoLive
    })

    await userEvent.click(screen.getByRole('button', { name: /Custom range/ }))

    expect(onGoLive).toHaveBeenCalled()
  })

  test('Should label the theme toggle with its destination', async () => {
    const onToggleTheme = vi.fn()
    renderHeader({ theme: 'dark', onToggleTheme })

    const toggle = screen.getByRole('button', { name: 'Switch to light theme' })
    await userEvent.click(toggle)

    expect(onToggleTheme).toHaveBeenCalled()
  })

  test('Should show the freshness timestamp when one is available', () => {
    renderHeader({ lastUpdated: '10:31' })

    expect(screen.getByText('Updated 10:31')).toBeInTheDocument()
  })

  test('Should not show a settings button when no handler is supplied', () => {
    renderHeader()

    expect(
      screen.queryByRole('button', { name: 'Open settings' })
    ).not.toBeInTheDocument()
  })

  test('Should open settings when the settings button is clicked', async () => {
    const onOpenSettings = vi.fn()
    renderHeader({ onOpenSettings })

    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }))

    expect(onOpenSettings).toHaveBeenCalled()
  })
})
