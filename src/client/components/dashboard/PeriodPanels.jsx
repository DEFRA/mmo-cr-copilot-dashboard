import { formatSprintRange } from '../../lib/sprints.js'
import { Button } from '../govuk/Button.jsx'
import { ErrorMessage } from '../govuk/ErrorMessage.jsx'
import { cx, joinIds } from '../govuk/utils.js'
import { Icon } from './Icon.jsx'
import { Calendar } from './PeriodCalendar.jsx'

const DAY_MS = 86_400_000
const WEEK_DAYS = 7
export const SPRINT_NAMES = ['Last Sprint', '2 sprints ago', '3 sprints ago']
const QUICK_RANGES = [
  { label: 'Last 7 days', ms: WEEK_DAYS * DAY_MS },
  { label: 'Last 24 hours', ms: DAY_MS }
]

/** The last three sprints, then the way into a custom period. */
export function SprintOptions({
  ids,
  sprints,
  selectedIndex,
  customSelected,
  firstOptionRef,
  customOptionRef,
  onChoose,
  onCustom
}) {
  return (
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
              aria-current={index === selectedIndex ? 'true' : undefined}
              onClick={() => onChoose(sprint)}
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
        aria-current={customSelected ? 'true' : undefined}
        onClick={onCustom}
      >
        <span className="app-option__label">
          <Icon name="calendar" size={16} />
          Custom period
        </span>
        <span aria-hidden="true">›</span>
      </button>
    </>
  )
}

function DateRow({ side, text, ids, fields, error, inputRef, onChange }) {
  const name = `${side}Date`
  const timeName = `${side}Time`
  const timeId = `${ids[side]}-time`
  return (
    <div className="app-range__row">
      <label className="govuk-label govuk-label--s" htmlFor={ids[side]}>
        {text}
      </label>
      <input
        ref={inputRef}
        id={ids[side]}
        className={cx(
          'govuk-input',
          error?.fields.includes(name) && 'govuk-input--error'
        )}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-describedby={joinIds(ids.hint, error && ids.error)}
        value={fields[name]}
        onChange={(event) => onChange(name, event.target.value)}
      />
      <span>
        <label className="govuk-visually-hidden" htmlFor={timeId}>
          {`${text} time`}
        </label>
        <input
          id={timeId}
          className="govuk-input"
          type="time"
          value={fields[timeName]}
          onChange={(event) => onChange(timeName, event.target.value)}
        />
      </span>
    </div>
  )
}

/** Quick ranges, a calendar and typed start and end fields. */
export function CustomPeriod({
  ids,
  titleRef,
  inputRefs,
  month,
  range,
  today,
  fields,
  error,
  onBack,
  onQuick,
  onMonth,
  onPick,
  onField,
  onApply,
  onCancel
}) {
  const row = { ids, fields, error, onChange: onField }
  return (
    <>
      <button type="button" className="app-popover__back" onClick={onBack}>
        ‹ Back to previous sprints
      </button>
      <p
        ref={titleRef}
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
            onClick={() => onQuick(quick.ms)}
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
        onMonth={onMonth}
        onPick={onPick}
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
        {error && <ErrorMessage id={ids.error}>{error.message}</ErrorMessage>}
        <DateRow
          side="from"
          text="From"
          inputRef={inputRefs.fromDate}
          {...row}
        />
        <DateRow side="to" text="To" inputRef={inputRefs.toDate} {...row} />
      </div>
      <div className="govuk-button-group govuk-!-margin-bottom-0">
        <Button className="govuk-!-margin-bottom-0" onClick={onApply}>
          Apply period
        </Button>
        <Button
          variant="secondary"
          className="govuk-!-margin-bottom-0"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </>
  )
}
