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
import { cx } from '../govuk/utils.js'
import { Icon } from './Icon.jsx'
import { endOfDay, firstOfMonth, startOfDay } from './PeriodCalendar.jsx'
import { CustomPeriod, SPRINT_NAMES, SprintOptions } from './PeriodPanels.jsx'

const SHOWN_SPRINTS = SPRINT_NAMES.length
const INVALID = 'Enter a valid start and end, like 14/10/2026'
const ORDER = 'Start must be before end'

const time = (date) => new Date(date).getTime()

const toFields = ({ from, to }) => ({
  fromDate: from ? toDateInput(from) : '',
  fromTime: from ? toTimeInput(from) : '00:00',
  toDate: to ? toDateInput(to) : '',
  toTime: to ? toTimeInput(to) : '23:59'
})

/** A clicked day starts a new range, or closes the open one around it. */
function nextRange(range, day, at) {
  if (!range.from || range.to) {
    return { from: day, to: null }
  }
  if (day < range.from) {
    return { from: day, to: endOfDay(range.from) }
  }
  return { from: range.from, to: new Date(Math.min(endOfDay(day), at)) }
}

function rangeFailure(from, to) {
  if (!from || !to) {
    const fields = [!from && 'fromDate', !to && 'toDate']
    return { message: INVALID, fields: fields.filter(Boolean) }
  }
  return from >= to ? { message: ORDER, fields: ['fromDate', 'toDate'] } : null
}

function periodLabel({ isLive, selected, selectedIndex, start, end }) {
  if (selected) {
    const range = formatSprintRange(selected.start, selected.end)
    return `${SPRINT_NAMES[selectedIndex]}, ${range}`
  }
  return isLive ? null : formatWindow(start, end)
}

/** The live sprint, the previous ones, and which of them `start`/`end` match. */
function periodSelection({ mode, start, end, sprintWindows, today }) {
  const windows =
    sprintWindows?.length > 0
      ? sprintWindows
      : recentSprints(SHOWN_SPRINTS + 1, today)
  const sprints = windows.slice(1, SHOWN_SPRINTS + 1)
  const isLive = mode !== 'custom'
  const selectedIndex = isLive
    ? -1
    : sprints.findIndex(
        (s) => time(s.start) === time(start) && time(s.end) === time(end)
      )
  const selected = sprints[selectedIndex] ?? null
  const label = periodLabel({ isLive, selected, selectedIndex, start, end })
  const live = windows[0] ?? sprintForDate(today)
  const status = label
    ? `Showing ${label}, a historical snapshot, not live`
    : `Showing the live sprint, ${formatSprintRange(live.start, live.end)}`
  return { live, sprints, isLive, selectedIndex, selected, label, status }
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
  const { live, sprints, isLive, selectedIndex, selected, label, status } =
    periodSelection({ mode, start, end, sprintWindows, today })

  useEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    target?.current?.focus()
  })

  const close = (returnFocus = true) => {
    setOpen(false)
    setError(null)
    if (returnFocus) {
      pendingFocus.current = toggleRef
    }
  }

  useEffect(() => {
    if (!open) {
      return undefined
    }
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setError(null)
      }
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return
      }
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
    setError(null)
    setDraft(nextRange(range, day, current()))
  }

  const changeField = (name, value) => {
    const nextFields = { ...fields, [name]: value }
    setFields(nextFields)
    const side = name.startsWith('from') ? 'from' : 'to'
    const parsed = parseDateTime(
      nextFields[`${side}Date`],
      nextFields[`${side}Time`]
    )
    if (!parsed) {
      return
    }
    setRange((r) => ({ ...r, [side]: parsed }))
    setMonth(firstOfMonth(parsed))
  }

  const apply = () => {
    const from = parseDateTime(fields.fromDate, fields.fromTime)
    const to = parseDateTime(fields.toDate, fields.toTime)
    const failure = rangeFailure(from, to)
    if (failure) {
      setError(failure)
      pendingFocus.current = inputRefs[failure.fields[0]]
      return
    }
    onApplyRange(from, to)
    close()
  }

  const stepMonth = (step) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + step, 1))
  const showing = open ? view : null

  return (
    <div className="app-period" ref={rootRef}>
      <fieldset className="app-period__controls" aria-label="Time period">
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
          <dialog
            id={ids.popover}
            className={cx(
              'app-popover',
              showing === 'custom' && 'app-popover--wide'
            )}
            aria-modal="false"
            aria-labelledby={view === 'sprints' ? ids.sprints : ids.custom}
            open={open}
            hidden={!open}
          >
            {showing === 'sprints' && (
              <SprintOptions
                ids={ids}
                sprints={sprints}
                selectedIndex={selectedIndex}
                customSelected={!isLive && !selected}
                firstOptionRef={firstOptionRef}
                customOptionRef={customOptionRef}
                onChoose={chooseSprint}
                onCustom={showCustom}
              />
            )}
            {showing === 'custom' && (
              <CustomPeriod
                ids={ids}
                titleRef={customTitleRef}
                inputRefs={inputRefs}
                month={month}
                range={range}
                today={today}
                fields={fields}
                error={error}
                onBack={showSprints}
                onQuick={chooseQuick}
                onMonth={stepMonth}
                onPick={pickDay}
                onField={changeField}
                onApply={apply}
                onCancel={() => close()}
              />
            )}
          </dialog>
        </div>
      </fieldset>
      <output className="govuk-visually-hidden">{status}</output>
    </div>
  )
}
