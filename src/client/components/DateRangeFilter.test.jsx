import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DateRangeFilter } from './DateRangeFilter'

const start = new Date(2026, 6, 8, 9, 0)
const end = new Date(2026, 6, 22, 9, 0)

const presets = [
  { id: 'live', label: 'Current sprint · 8–21 Jul', isLive: true },
  {
    id: 'prev',
    label: 'Previous sprint · 24 Jun–7 Jul',
    start: new Date(2026, 5, 24),
    end: new Date(2026, 6, 8)
  }
]

function renderFilter(props = {}) {
  const onGoLive = vi.fn()
  const onApplyRange = vi.fn()

  render(
    <DateRangeFilter
      start={start}
      end={end}
      label="Sprint · 8–21 Jul"
      presets={presets}
      onGoLive={onGoLive}
      onApplyRange={onApplyRange}
      {...props}
    />
  )

  return { onGoLive, onApplyRange }
}

const openPopover = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Sprint/ }))
  return screen.getByRole('dialog', { name: 'Select time window' })
}

describe('#DateRangeFilter', () => {
  test('Should show the active window on the trigger', () => {
    renderFilter()

    expect(
      screen.getByRole('button', { name: /Sprint · 8–21 Jul/ })
    ).toBeInTheDocument()
  })

  test('Should keep the popover closed until the trigger is used', () => {
    renderFilter()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sprint/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  test('Should open the popover and report it as expanded', async () => {
    renderFilter()

    await openPopover()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sprint/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  test('Should return to live mode from the live preset', async () => {
    const { onGoLive } = renderFilter()
    await openPopover()

    await userEvent.click(
      screen.getByRole('button', { name: /Current sprint/ })
    )

    expect(onGoLive).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Should apply a fixed preset range', async () => {
    const { onApplyRange } = renderFilter()
    await openPopover()

    await userEvent.click(
      screen.getByRole('button', { name: /Previous sprint/ })
    )

    expect(onApplyRange).toHaveBeenCalledWith(presets[1].start, presets[1].end)
  })

  test('Should seed the custom inputs from the active window', async () => {
    renderFilter()
    await openPopover()

    expect(screen.getByLabelText('From')).toHaveValue('2026-07-08T09:00')
    expect(screen.getByLabelText('To')).toHaveValue('2026-07-22T09:00')
  })

  test('Should apply a valid custom range', async () => {
    const { onApplyRange } = renderFilter()
    await openPopover()

    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '2026-07-10T08:00')
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply custom range' })
    )

    expect(onApplyRange).toHaveBeenCalledTimes(1)
    expect(onApplyRange.mock.calls[0][0]).toEqual(new Date(2026, 6, 10, 8, 0))
  })

  test('Should reject a range that starts after it ends', async () => {
    const { onApplyRange } = renderFilter()
    await openPopover()

    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '2026-08-01T08:00')
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply custom range' })
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Start must be before end.'
    )
    expect(onApplyRange).not.toHaveBeenCalled()
  })

  test('Should reject an incomplete range', async () => {
    const { onApplyRange } = renderFilter()
    await openPopover()

    await userEvent.clear(screen.getByLabelText('From'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply custom range' })
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid start and end.'
    )
    expect(onApplyRange).not.toHaveBeenCalled()
  })

  test('Should close the popover on Escape', async () => {
    renderFilter()
    await openPopover()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Should close the popover when clicking away', async () => {
    renderFilter()
    await openPopover()

    await userEvent.click(document.body)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
