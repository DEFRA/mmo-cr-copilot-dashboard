import { render, screen } from '@testing-library/react'

import { Hero } from './Hero.jsx'

const renderHero = (props = {}) =>
  render(
    <Hero
      serviceName="Copilot Delivery Insights"
      caption="MMO Catch Recording"
      heading="Project overview"
      {...props}
    />
  )

describe('#Hero', () => {
  test('Should render the heading as the page heading', () => {
    renderHero()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Project overview' })
    ).toBeInTheDocument()
    expect(screen.getByText('MMO Catch Recording')).toBeInTheDocument()
  })

  test('Should show the Beta phase banner without a dead feedback link', () => {
    renderHero()

    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('This is a new service.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('Should keep the document title in step with the heading', () => {
    const { rerender } = renderHero()

    expect(document.title).toBe('Project overview – Copilot Delivery Insights')

    rerender(
      <Hero serviceName="Copilot Delivery Insights" heading="Settings" />
    )

    expect(document.title).toBe('Settings – Copilot Delivery Insights')
  })

  test('Should omit the controls when there are none', () => {
    const { container } = renderHero()

    expect(container.querySelector('.app-hero__controls')).toBeNull()
  })

  test('Should render breadcrumbs, controls and notices in their slots', () => {
    renderHero({
      breadcrumbs: <nav aria-label="Breadcrumb" />,
      controls: <button type="button">Period</button>,
      notices: <p>Reconnecting</p>
    })

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Period' })).toBeInTheDocument()
    expect(screen.getByText('Reconnecting')).toBeInTheDocument()
  })
})
