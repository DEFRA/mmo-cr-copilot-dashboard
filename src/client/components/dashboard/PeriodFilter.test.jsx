import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { formatSprintRange, recentSprints } from '../../lib/sprints.js'
import { PeriodFilter } from './PeriodFilter.jsx'

const NOW = new Date(2026, 9, 15, 14, 32)
const [LIVE, PREVIOUS, TWO_AGO] = recentSprints(4, NOW)
const DAY_MS = 24 * 60 * 60 * 1000

function renderFilter(props = {}) {
  const handlers = { onGoLive: vi.fn(), onApplyRange: vi.fn() }
  const utils = render(
    <PeriodFilter mode="live" now={NOW} {...handlers} {...props} />
  )
  return { ...handlers, ...utils }
}

const menuButton = () =>
  screen.getAllByRole('button').find((b) => b.hasAttribute('aria-expanded'))
const openMenu = () => userEvent.click(menuButton())
const openCustom = async () => {
  await openMenu()
  await userEvent.click(screen.getByRole('button', { name: /Custom period/ }))
}
const day = (n) =>
  screen.getByRole('button', { name: new RegExp(`\\b${n} October 2026`) })

describe('#PeriodFilter', () => {
  test('Should use the project sprint calendar when supplied', async () => {
    const at = (d) => new Date(Date.UTC(2026, 9, d))
    const sprintWindows = [
      { index: 9, start: at(13), end: at(27) },
      { index: 8, start: at(1), end: at(13) },
      { index: 7, start: new Date(Date.UTC(2026, 8, 19)), end: at(1) }
    ]
    renderFilter({ sprintWindows })

    expect(
      screen.getByRole('button', { name: /Live sprint/ })
    ).toHaveTextContent(formatSprintRange(at(13), at(27)))
    await openMenu()
    expect(
      screen.getByRole('button', {
        name: new RegExp(formatSprintRange(at(1), at(13)))
      })
    ).toBeInTheDocument()
  })

  test('Should present a labelled group with the live sprint pressed', () => {
    renderFilter()

    const group = screen.getByRole('group', { name: 'Time period' })
    const live = within(group).getByRole('button', { name: /Live sprint/ })
    expect(live).toHaveAttribute('aria-pressed', 'true')
    expect(live).toHaveTextContent(formatSprintRange(LIVE.start, LIVE.end))
    expect(menuButton()).toHaveAccessibleName('Previous sprints')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('status')).toHaveTextContent(
      `Showing the live sprint, ${formatSprintRange(LIVE.start, LIVE.end)}`
    )
    expect(screen.getByRole('status')).toHaveClass('govuk-visually-hidden')
    expect(screen.queryByText('Time period')).not.toBeInTheDocument()
  })

  test('Should return to live from the live chip', async () => {
    const { onGoLive } = renderFilter({
      mode: 'custom',
      start: PREVIOUS.start,
      end: PREVIOUS.end
    })

    await userEvent.click(screen.getByRole('button', { name: /Live sprint/ }))

    expect(onGoLive).toHaveBeenCalledOnce()
  })

  test('Should list the last three sprints, focus the first and close on Escape', async () => {
    renderFilter()

    await openMenu()

    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'Previous sprints' })
    const options = within(dialog).getAllByRole('listitem')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent('Previous sprint')
    expect(options[2]).toHaveTextContent('3 sprints ago')
    expect(within(options[0]).getByRole('button')).toHaveFocus()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(menuButton()).toHaveFocus()
  })

  test('Should apply a sprint and return focus to the menu chip', async () => {
    const { onApplyRange } = renderFilter()

    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: /2 sprints ago/ }))

    expect(onApplyRange).toHaveBeenCalledWith(TWO_AGO.start, TWO_AGO.end)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(menuButton()).toHaveFocus()
  })

  test('Should show the selected sprint on the chip and in the menu', async () => {
    renderFilter({ mode: 'custom', start: PREVIOUS.start, end: PREVIOUS.end })

    const range = formatSprintRange(PREVIOUS.start, PREVIOUS.end)
    expect(menuButton()).toHaveAccessibleName(
      `Time period: Previous sprint, ${range}`
    )
    expect(menuButton()).toHaveClass('app-chip--selected')
    expect(screen.getByRole('button', { name: /Live sprint/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'historical snapshot, not live'
    )

    await openMenu()
    expect(
      screen.getByRole('button', { name: /^Previous sprint/ })
    ).toHaveAttribute('aria-current', 'true')
  })

  test('Should label a custom window and mark Custom period as current', async () => {
    const start = new Date(2026, 9, 1, 9, 0)
    const end = new Date(2026, 9, 3, 17, 0)
    renderFilter({ mode: 'custom', start, end })

    expect(menuButton()).toHaveAccessibleName(/^Time period: /)

    await openMenu()
    expect(
      screen.getByRole('button', { name: /Custom period/ })
    ).toHaveAttribute('aria-current', 'true')

    await userEvent.click(screen.getByRole('button', { name: /Custom period/ }))
    expect(screen.getByLabelText('From')).toHaveValue('01/10/2026')
    expect(screen.getByLabelText('To time')).toHaveValue('17:00')
  })

  test('Should move focus into the custom panel and back again', async () => {
    renderFilter()

    await openCustom()

    expect(screen.getByText('Custom period', { selector: 'p' })).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Custom period' })).toBeVisible()

    await userEvent.click(
      screen.getByRole('button', { name: '‹ Back to previous sprints' })
    )

    expect(screen.getByRole('button', { name: /Custom period/ })).toHaveFocus()
  })

  test.each([
    ['Last 7 days', 7 * DAY_MS],
    ['Last 24 hours', DAY_MS]
  ])('Should apply the %s quick range', async (name, ms) => {
    const { onApplyRange } = renderFilter()

    await openCustom()
    await userEvent.click(screen.getByRole('button', { name }))

    expect(onApplyRange).toHaveBeenCalledWith(new Date(NOW.getTime() - ms), NOW)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Should prefill today and mark today, future days and the next month', async () => {
    renderFilter()

    await openCustom()

    expect(screen.getByLabelText('From')).toHaveValue('15/10/2026')
    expect(screen.getByLabelText('From time')).toHaveValue('00:00')
    expect(screen.getByLabelText('To time')).toHaveValue('14:32')
    expect(day(15)).toHaveAttribute('aria-current', 'date')
    expect(day(16)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    expect(
      screen.getByRole('table', { name: /October 2026/ })
    ).toBeInTheDocument()
  })

  test('Should pick a range from the calendar and apply it', async () => {
    const { onApplyRange } = renderFilter()

    await openCustom()
    await userEvent.click(day(10))
    expect(day(10)).toHaveAccessibleName(/start of period$/)
    expect(screen.getByLabelText('To')).toHaveValue('')

    await userEvent.click(day(12))
    expect(day(11)).toHaveAccessibleName(/in period$/)
    expect(day(12)).toHaveAccessibleName(/end of period$/)
    expect(screen.getByLabelText('To time')).toHaveValue('23:59')

    await userEvent.click(screen.getByRole('button', { name: 'Apply period' }))

    expect(onApplyRange).toHaveBeenCalledWith(
      new Date(2026, 9, 10),
      new Date(2026, 9, 12, 23, 59)
    )
    expect(menuButton()).toHaveFocus()
  })

  test('Should swap the ends when the second day is earlier, and cap at now', async () => {
    renderFilter()

    await openCustom()
    await userEvent.click(day(12))
    await userEvent.click(day(10))

    expect(screen.getByLabelText('From')).toHaveValue('10/10/2026')
    expect(screen.getByLabelText('To')).toHaveValue('12/10/2026')

    await userEvent.click(day(14))
    await userEvent.click(day(15))
    expect(screen.getByLabelText('To time')).toHaveValue('14:32')
  })

  test('Should move between months', async () => {
    renderFilter()

    await openCustom()
    await userEvent.click(
      screen.getByRole('button', { name: 'Previous month' })
    )

    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
  })

  test('Should move the calendar to a typed date', async () => {
    renderFilter()

    await openCustom()
    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '05/08/2026')

    expect(screen.getByText('August 2026')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('From time'), {
      target: { value: '09:30' }
    })
    expect(screen.getByLabelText('From time')).toHaveValue('09:30')
  })

  test('Should reject an invalid date and focus it', async () => {
    const { onApplyRange } = renderFilter()

    await openCustom()
    await userEvent.clear(screen.getByLabelText('To'))
    await userEvent.click(screen.getByRole('button', { name: 'Apply period' }))

    const to = screen.getByLabelText('To')
    expect(
      screen.getByText('Enter a valid start and end, like 14/10/2026')
    ).toHaveClass('govuk-error-message')
    expect(to).toHaveClass('govuk-input--error')
    expect(screen.getByLabelText('From')).not.toHaveClass('govuk-input--error')
    expect(to).toHaveFocus()
    expect(to).toHaveAccessibleDescription(/Error: Enter a valid start/)
    expect(onApplyRange).not.toHaveBeenCalled()
  })

  test('Should reject a start after the end', async () => {
    renderFilter()

    await openCustom()
    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '15/10/2026')
    fireEvent.change(screen.getByLabelText('From time'), {
      target: { value: '15:00' }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Apply period' }))

    expect(screen.getByText('Start must be before end')).toBeInTheDocument()
    expect(from).toHaveFocus()
    expect(screen.getByLabelText('To')).toHaveClass('govuk-input--error')

    await userEvent.click(day(10))
    expect(
      screen.queryByText('Start must be before end')
    ).not.toBeInTheDocument()
  })

  test('Should close on Cancel, the chip, or an outside click', async () => {
    renderFilter()

    await openCustom()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(menuButton()).toHaveFocus()

    await openMenu()
    await openMenu()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openMenu()
    await userEvent.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Should ignore other keys and clicks inside while open', async () => {
    renderFilter()

    await openMenu()
    await userEvent.keyboard('a')
    await userEvent.click(
      screen.getByText('Previous sprints', { selector: 'p' })
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('Should default `now` to the current time', () => {
    render(
      <PeriodFilter mode="live" onGoLive={() => {}} onApplyRange={() => {}} />
    )

    expect(
      screen.getByRole('button', { name: /Live sprint/ })
    ).toBeInTheDocument()
  })

  test.each([['closed'], ['sprints'], ['custom']])(
    'Should have no axe violations when %s',
    async (view) => {
      const { container } = renderFilter()
      if (view === 'sprints') await openMenu()
      if (view === 'custom') await openCustom()

      expect(await axeViolations(container)).toStrictEqual([])
    }
  )
})
