import { useEffect, useId, useRef, useState } from 'react'

import {
  formatSprintRange,
  formatWindow,
  parseDateTime,
  recentSprints,
  sprintForDate,
  toDateInput,
  toTimeInput
} from '../../lib/sprints.js'
import { Button } from '../govuk/Button.jsx'
import { ErrorMessage } from '../govuk/ErrorMessage.jsx'
import { cx, joinIds } from '../govuk/utils.js'
import { Icon } from './Icon.jsx'

const DAY_MS = 24 * 60 * 60 * 1000
const SPRINT_NAMES = ['Previous sprint', '2 sprints ago', '3 sprints ago']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]
const HEADINGS = [...WEEKDAYS.slice(1), WEEKDAYS[0]]
const QUICK_RANGES = [
  { label: 'Last 7 days', ms: 7 * DAY_MS },
  { label: 'Last 24 hours', ms: DAY_MS }
]
const INVALID = 'Enter a valid start and end, like 14/10/2026'
const ORDER = 'Start must be before end'

const time = (date) => new Date(date).getTime()
const dayKey = (d) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59)
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

const toFields = ({ from, to }) => ({
  fromDate: from ? toDateInput(from) : '',
  fromTime: from ? toTimeInput(from) : '00:00',
  toDate: to ? toDateInput(to) : '',
  toTime: to ? toTimeInput(to) : '23:59'
})

function Calendar({ month, range, now, onMonth, onPick }) {
  const year = month.getFullYear()
  const index = month.getMonth()
  const offset = (new Date(year, index, 1).getDay() + 6) % 7
  const days = new Date(year, index + 1, 0).getDate()
  const today = dayKey(now)
  const from = range.from && dayKey(range.from)
  const to = range.to && dayKey(range.to)
  const atNow = year === now.getFullYear() && index === now.getMonth()

  const cells = Array.from({ length: offset }, () => null)
  for (let day = 1; day <= days; day++) cells.push(new Date(year, index, day))
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const dayButton = (date) => {
    const key = dayKey(date)
    const edge = key === from || key === to
    const inside = from && to && key > from && key < to
    let state = ''
    if (key === from) state = ', start of period'
    else if (key === to) state = ', end of period'
    else if (inside) state = ', in period'

    return (
      <button
        type="button"
        className={cx(
          'app-cal__day',
          edge && 'app-cal__day--edge',
          inside && 'app-cal__day--in',
          key === today && 'app-cal__day--today'
        )}
        aria-label={`${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[index]} ${year}${state}`}
        aria-current={key === today ? 'date' : undefined}
        disabled={key > today}
        onClick={() => onPick(date)}
      >
        {date.getDate()}
      </button>
    )
  }

  return (
    <div className="app-cal">
      <div className="app-cal__head">
        <button
          type="button"
          className="app-cal__nav"
          aria-label="Previous month"
          onClick={() => onMonth(-1)}
        >
          ‹
        </button>
        <p className="app-cal__title" aria-live="polite">
          {MONTHS[index]} {year}
        </p>
        <button
          type="button"
          className="app-cal__nav"
          aria-label="Next month"
          disabled={atNow}
          onClick={() => onMonth(1)}
        >
          ›
        </button>
      </div>
      <table className="app-cal__grid">
        <caption className="govuk-visually-hidden">
          {MONTHS[index]} {year}. Choose a start date, then an end date.
        </caption>
        <thead>
          <tr>
            {HEADINGS.map((day) => (
              <th key={day} scope="col">
                <abbr title={day}>{day.slice(0, 2)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={dayKey(week.find(Boolean))}>
              {week.map((date, i) => (
                // Blank cells pad the week; position is their identity.
                <td key={date ? dayKey(date) : `blank-${i}`}>
                  {date && dayButton(date)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Period filter from docs/design-system.md §8.3: Live sprint chip, a Previous
 * sprints popover (last 3 sprints) and a Custom period panel with quick ranges.
 * Controlled by `mode`, `start` and `end`; reports through the callbacks.
 * `sprintWindows` (newest first, from the project's server calendar) replaces
 * the local fixed cadence when supplied.
 */
export function PeriodFilter({
  mode,
  start,
  end,
  onGoLive,
  onApplyRange,
  now,
  sprintWindows
}) {
  const ids = {
    popover: useId(),
    sprints: useId(),
    custom: useId(),
    hint: useId(),
    error: useId(),
    from: useId(),
    to: useId()
  }
  const rootRef = useRef(null)
  const toggleRef = useRef(null)
  const firstOptionRef = useRef(null)
  const customOptionRef = useRef(null)
  const customTitleRef = useRef(null)
  const inputRefs = { fromDate: useRef(null), toDate: useRef(null) }
  const pendingFocus = useRef(null)

  const [open, setOpen] = useState(false)
  const [view, setView] = useState('sprints')
  const [range, setRange] = useState({ from: null, to: null })
  const [fields, setFields] = useState(() => toFields(range))
  const [month, setMonth] = useState(() => firstOfMonth(new Date()))
  const [error, setError] = useState(null)

  const current = () => now ?? new Date()
  const today = current()
  const windows =
    sprintWindows?.length > 0 ? sprintWindows : recentSprints(4, today)
  const live = windows[0] ?? sprintForDate(today)
  const sprints = windows.slice(1, 4)
  const isLive = mode !== 'custom'
  const selectedIndex = isLive
    ? -1
    : sprints.findIndex(
        (s) => time(s.start) === time(start) && time(s.end) === time(end)
      )
  const selected = selectedIndex >= 0 ? sprints[selectedIndex] : null

  let label = null
  if (selected) {
    label = `${SPRINT_NAMES[selectedIndex]}, ${formatSprintRange(selected.start, selected.end)}`
  } else if (!isLive) {
    label = formatWindow(start, end)
  }

  useEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    target?.current?.focus()
  })

  const close = (returnFocus = true) => {
    setOpen(false)
    setError(null)
    if (returnFocus) pendingFocus.current = toggleRef
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setError(null)
      }
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setError(null)
      toggleRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = () => {
    if (open) {
      close()
      return
    }
    setView('sprints')
    setOpen(true)
    pendingFocus.current = firstOptionRef
  }

  const goLive = () => {
    onGoLive()
    close(false)
  }

  const chooseSprint = (sprint) => {
    onApplyRange(sprint.start, sprint.end)
    close()
  }

  const chooseQuick = (ms) => {
    const at = current()
    onApplyRange(new Date(at.getTime() - ms), at)
    close()
  }

  const setDraft = (next) => {
    setRange(next)
    setFields(toFields(next))
  }

  const showCustom = () => {
    const at = current()
    const next = isLive
      ? { from: startOfDay(at), to: at }
      : { from: new Date(start), to: new Date(end) }
    setDraft(next)
    setMonth(firstOfMonth(next.to))
    setError(null)
    setView('custom')
    pendingFocus.current = customTitleRef
  }

  const showSprints = () => {
    setView('sprints')
    setError(null)
    pendingFocus.current = customOptionRef
  }

  const pickDay = (day) => {
    const at = current()
    let next
    if (!range.from || range.to) {
      next = { from: day, to: null }
    } else if (day < range.from) {
      next = { from: day, to: endOfDay(range.from) }
    } else {
      const last = endOfDay(day)
      next = { from: range.from, to: last > at ? at : last }
    }
    setError(null)
    setDraft(next)
  }

  const changeField = (name, value) => {
    const nextFields = { ...fields, [name]: value }
    setFields(nextFields)
    const side = name.startsWith('from') ? 'from' : 'to'
    const parsed = parseDateTime(
      nextFields[`${side}Date`],
      nextFields[`${side}Time`]
    )
    if (!parsed) return
    setRange((r) => ({ ...r, [side]: parsed }))
    setMonth(firstOfMonth(parsed))
  }

  const apply = () => {
    const from = parseDateTime(fields.fromDate, fields.fromTime)
    const to = parseDateTime(fields.toDate, fields.toTime)
    let failure = null
    if (!from || !to) {
      failure = {
        message: INVALID,
        fields: [!from && 'fromDate', !to && 'toDate'].filter(Boolean)
      }
    } else if (from >= to) {
      failure = { message: ORDER, fields: ['fromDate', 'toDate'] }
    }
    if (failure) {
      setError(failure)
      pendingFocus.current = inputRefs[failure.fields[0]]
      return
    }
    onApplyRange(from, to)
    close()
  }

  const dateRow = (side, text) => {
    const name = `${side}Date`
    const invalid = error?.fields.includes(name)
    return (
      <div className="app-range__row">
        <label className="govuk-label govuk-label--s" htmlFor={ids[side]}>
          {text}
        </label>
        <input
          ref={inputRefs[name]}
          id={ids[side]}
          className={cx('govuk-input', invalid && 'govuk-input--error')}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={joinIds(ids.hint, error && ids.error)}
          value={fields[name]}
          onChange={(event) => changeField(name, event.target.value)}
        />
        <span>
          <label
            className="govuk-visually-hidden"
            htmlFor={`${ids[side]}-time`}
          >
            {text} time
          </label>
          <input
            id={`${ids[side]}-time`}
            className="govuk-input"
            type="time"
            value={fields[`${side}Time`]}
            onChange={(event) => changeField(`${side}Time`, event.target.value)}
          />
        </span>
      </div>
    )
  }

  let status = `Showing the live sprint, ${formatSprintRange(live.start, live.end)}`
  if (label) status = `Showing ${label}, a historical snapshot, not live`

  return (
    <div className="app-period" ref={rootRef}>
      <div
        className="app-period__controls"
        role="group"
        aria-label="Time period"
      >
        <button
          type="button"
          className="app-chip app-chip--live"
          aria-pressed={isLive}
          onClick={goLive}
        >
          <span className="app-pulse" aria-hidden="true" />
          Live sprint{' '}
          <span className="app-chip__sub">
            {formatSprintRange(live.start, live.end)}
          </span>
        </button>
        <div className="app-period__menu">
          <button
            ref={toggleRef}
            type="button"
            className={cx('app-chip', !isLive && 'app-chip--selected')}
            aria-expanded={open}
            aria-controls={ids.popover}
            onClick={toggle}
          >
            {label ? (
              <span>
                <span className="govuk-visually-hidden">Time period:</span>{' '}
                {label}
              </span>
            ) : (
              'Previous sprints'
            )}
            <Icon name="chevron" size={16} />
          </button>
          <div
            id={ids.popover}
            className="app-popover"
            role="dialog"
            aria-modal="false"
            aria-labelledby={view === 'sprints' ? ids.sprints : ids.custom}
            hidden={!open}
          >
            {open && view === 'sprints' && (
              <>
                <p className="app-popover__title" id={ids.sprints}>
                  Previous sprints
                </p>
                <ul className="app-options" aria-labelledby={ids.sprints}>
                  {sprints.map((sprint, index) => (
                    <li key={sprint.index}>
                      <button
                        ref={index === 0 ? firstOptionRef : undefined}
                        type="button"
                        className="app-option"
                        aria-current={
                          index === selectedIndex ? 'true' : undefined
                        }
                        onClick={() => chooseSprint(sprint)}
                      >
                        <span>{SPRINT_NAMES[index]}</span>
                        <span className="app-option__sub">
                          {formatSprintRange(sprint.start, sprint.end)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <hr className="app-popover__rule" />
                <button
                  ref={customOptionRef}
                  type="button"
                  className="app-option"
                  aria-current={!isLive && !selected ? 'true' : undefined}
                  onClick={showCustom}
                >
                  <span className="app-option__label">
                    <Icon name="calendar" size={16} />
                    Custom period
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </>
            )}
            {open && view === 'custom' && (
              <>
                <button
                  type="button"
                  className="app-popover__back"
                  onClick={showSprints}
                >
                  ‹ Back to previous sprints
                </button>
                <p
                  ref={customTitleRef}
                  className="app-popover__title"
                  id={ids.custom}
                  tabIndex={-1}
                >
                  Custom period
                </p>
                <p className="app-popover__sub">Quick ranges</p>
                <div className="app-quick">
                  {QUICK_RANGES.map((quick) => (
                    <button
                      key={quick.label}
                      type="button"
                      className="app-chip app-chip--s"
                      onClick={() => chooseQuick(quick.ms)}
                    >
                      {quick.label}
                    </button>
                  ))}
                </div>
                <p className="app-popover__sub">Or pick a start and end date</p>
                <Calendar
                  month={month}
                  range={range}
                  now={today}
                  onMonth={(step) =>
                    setMonth(
                      (m) => new Date(m.getFullYear(), m.getMonth() + step, 1)
                    )
                  }
                  onPick={pickDay}
                />
                <div
                  className={cx(
                    'govuk-form-group',
                    'app-range',
                    error && 'govuk-form-group--error'
                  )}
                >
                  <div className="govuk-hint app-range__hint" id={ids.hint}>
                    Date as dd/mm/yyyy, for example 14/10/2026, then a time
                  </div>
                  {error && (
                    <ErrorMessage id={ids.error}>{error.message}</ErrorMessage>
                  )}
                  {dateRow('from', 'From')}
                  {dateRow('to', 'To')}
                </div>
                <div className="govuk-button-group govuk-!-margin-bottom-0">
                  <Button className="govuk-!-margin-bottom-0" onClick={apply}>
                    Apply period
                  </Button>
                  <Button
                    variant="secondary"
                    className="govuk-!-margin-bottom-0"
                    onClick={() => close()}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="govuk-visually-hidden" role="status">
        {status}
      </p>
    </div>
  )
}
