import { cx } from '../govuk/utils.js'

const DAYS_PER_WEEK = 7
// getDay() counts from Sunday; the grid starts on Monday.
const MONDAY_SHIFT = 6
const LAST_HOUR = 23
const LAST_MINUTE = 59
const YEAR_KEY = 10000
const MONTH_KEY = 100
const ABBR_LENGTH = 2

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

export const dayKey = (d) =>
  d.getFullYear() * YEAR_KEY + d.getMonth() * MONTH_KEY + d.getDate()
export const startOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const endOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), LAST_HOUR, LAST_MINUTE)
export const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

/** The month as Monday-first weeks, padded with `null` either side. */
function monthWeeks(year, index) {
  const offset =
    (new Date(year, index, 1).getDay() + MONDAY_SHIFT) % DAYS_PER_WEEK
  const days = new Date(year, index + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, day) => new Date(year, index, day + 1))
  ]
  const weekCount = Math.ceil(cells.length / DAYS_PER_WEEK)
  return Array.from({ length: weekCount }, (_week, week) =>
    Array.from(
      { length: DAYS_PER_WEEK },
      (_day, day) => cells[week * DAYS_PER_WEEK + day] ?? null
    )
  )
}

function dayState(key, from, to, inside) {
  if (key === from) {
    return ', start of period'
  }
  if (key === to) {
    return ', end of period'
  }
  return inside ? ', in period' : ''
}

function DayButton({ date, from, to, today, onPick }) {
  const key = dayKey(date)
  const inside = Boolean(from && to && key > from && key < to)
  const isToday = key === today
  const name = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`

  return (
    <button
      type="button"
      className={cx(
        'app-cal__day',
        (key === from || key === to) && 'app-cal__day--edge',
        inside && 'app-cal__day--in',
        isToday && 'app-cal__day--today'
      )}
      aria-label={name + dayState(key, from, to, inside)}
      aria-current={isToday ? 'date' : undefined}
      disabled={key > today}
      onClick={() => onPick(date)}
    >
      {date.getDate()}
    </button>
  )
}

export function Calendar({ month, range, now, onMonth, onPick }) {
  const year = month.getFullYear()
  const index = month.getMonth()
  const today = dayKey(now)
  const from = range.from && dayKey(range.from)
  const to = range.to && dayKey(range.to)
  const atNow = year === now.getFullYear() && index === now.getMonth()
  const title = `${MONTHS[index]} ${year}`

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
          {title}
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
          {`${title}. Choose a start date, then an end date.`}
        </caption>
        <thead>
          <tr>
            {HEADINGS.map((day) => (
              <th key={day} scope="col">
                <abbr title={day}>{day.slice(0, ABBR_LENGTH)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(year, index).map((week) => (
            <tr key={dayKey(week.find(Boolean))}>
              {week.map((date, i) => (
                // Blank cells pad the week; position is their identity.
                <td key={date ? dayKey(date) : `blank-${i}`}>
                  {date && (
                    <DayButton
                      date={date}
                      from={from}
                      to={to}
                      today={today}
                      onPick={onPick}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
