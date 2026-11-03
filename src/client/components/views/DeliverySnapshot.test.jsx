import { render, screen } from '@testing-library/react'

import { buildPayloadV2 } from '#/test-helpers/payload-fixture.js'
import { DeliverySnapshot } from './DeliverySnapshot'

const metrics = {
  changeLeadTimeDays: 2.5,
  deliveryFrequencyPerWeek: 1.5,
  changeFailRate: 40,
  unlinkedPrRate: 50,
  warnings: []
}

const renderSnapshot = (delivery) =>
  render(
    <DeliverySnapshot
      delivery={delivery}
      payloads={[buildPayloadV2({ prNumber: 7, jiraKeys: [] })]}
      window={{ start: null, end: null }}
      deliveryHref="#/projects/mmo/delivery"
      onOpenTicket={vi.fn()}
      onOpenPR={vi.fn()}
    />
  )

describe('#DeliverySnapshot', () => {
  test('Should show four headline cards and link to the delivery page', () => {
    renderSnapshot({ metrics, issues: [], status: 'success' })

    expect(screen.getByRole('heading', { name: 'Delivery' })).toBeVisible()
    expect(screen.getByText(/change lead time/i)).toBeInTheDocument()
    expect(screen.getByText(/change fail/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'View all delivery metrics' })
    ).toHaveAttribute('href', '#/projects/mmo/delivery')
  })

  test('Should show the loading and error states', () => {
    const { unmount } = renderSnapshot({
      metrics: null,
      issues: [],
      status: 'loading'
    })
    expect(screen.queryByText(/change lead time/i)).not.toBeInTheDocument()
    unmount()

    renderSnapshot({ metrics: null, issues: [], status: 'error' })
    expect(
      screen.getByText('We could not load delivery metrics. Try again later.')
    ).toBeInTheDocument()
  })
})
