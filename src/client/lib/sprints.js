/**
 * Sprint helpers. The team runs fixed two-week sprints; "Live" on the
 * dashboard means "the sprint that contains now". All sprint boundaries are
 * derived from a single known anchor so the breakdown stays consistent.
 *
 * Reference sprint: 8 Jul 2026 → 21 Jul 2026 (inclusive), i.e. [8 Jul, 22 Jul).
 */

const SPRINT_LENGTH_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const SPRINT_LENGTH_MS = SPRINT_LENGTH_DAYS * DAY_MS

/** Known sprint start (local midnight). Month is 0-indexed → 6 = July. */
const SPRINT_ANCHOR = new Date(2026, 6, 8, 0, 0, 0, 0)

function toTime(d) {
  return d instanceof Date ? d.getTime() : new Date(d).getTime()
}

/** The sprint window that contains `date`. `end` is exclusive. */
export function sprintForDate(date = new Date()) {
  const diff = toTime(date) - SPRINT_ANCHOR.getTime()
  const index = Math.floor(diff / SPRINT_LENGTH_MS)
  const start = new Date(SPRINT_ANCHOR.getTime() + index * SPRINT_LENGTH_MS)
  const end = new Date(start.getTime() + SPRINT_LENGTH_MS)
  return { index, start, end }
}

/** The sprint containing the current moment. */
export function currentSprint() {
  return sprintForDate(new Date())
}

/** `count` sprints ending with the current one, newest first. */
export function recentSprints(count = 4, from = new Date()) {
  const cur = sprintForDate(from)
  const out = []
  for (let i = 0; i < count; i += 1) {
    const start = new Date(cur.start.getTime() - i * SPRINT_LENGTH_MS)
    const end = new Date(start.getTime() + SPRINT_LENGTH_MS)
    out.push({ index: cur.index - i, start, end })
  }
  return out
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

/**
 * Compact label for a sprint window, e.g. "8–21 Jul" or "29 Jun–12 Jul".
 * `end` is treated as exclusive, so the displayed last day is end − 1 day.
 */
export function formatSprintRange(start, end) {
  const s = start instanceof Date ? start : new Date(start)
  const lastDay = new Date(toTime(end) - DAY_MS)
  const sameMonth = s.getMonth() === lastDay.getMonth()
  const sameYear = s.getFullYear() === lastDay.getFullYear()
  const yearSuffix = sameYear ? '' : ` ${lastDay.getFullYear()}`
  if (sameMonth && sameYear) {
    return `${s.getDate()}–${lastDay.getDate()} ${MONTHS[lastDay.getMonth()]}`
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]}–${lastDay.getDate()} ${MONTHS[lastDay.getMonth()]}${yearSuffix}`
}

/** Human label for an arbitrary window including time-of-day. */
export function formatWindow(start, end) {
  const opts = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }
  const s = new Date(start).toLocaleString(undefined, opts)
  const e = new Date(end).toLocaleString(undefined, opts)
  return `${s} → ${e}`
}

/** Convert a Date to the `value` a <input type="datetime-local"> expects. */
export function toDateTimeLocal(date) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export { SPRINT_LENGTH_DAYS }
