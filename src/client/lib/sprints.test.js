import {
  SPRINT_LENGTH_DAYS,
  sprintForDate,
  currentSprint,
  recentSprints,
  formatSprintRange,
  formatWindow,
  toDateTimeLocal
} from './sprints.js'

// The anchor sprint runs 8 Jul 2026 → 22 Jul 2026 (end exclusive), local time.
const anchor = new Date(2026, 6, 8)
const DAY_MS = 24 * 60 * 60 * 1000

describe('#sprintForDate', () => {
  test('Should return the anchor sprint for the anchor date', () => {
    const sprint = sprintForDate(anchor)

    expect(sprint.index).toBe(0)
    expect(sprint.start).toEqual(anchor)
    expect(sprint.end).toEqual(new Date(2026, 6, 22))
  })

  test('Should keep a date inside the window in the same sprint', () => {
    expect(sprintForDate(new Date(2026, 6, 21, 23, 59)).index).toBe(0)
  })

  test('Should roll over to the next sprint on the exclusive end', () => {
    expect(sprintForDate(new Date(2026, 6, 22)).index).toBe(1)
  })

  test('Should index sprints before the anchor negatively', () => {
    expect(sprintForDate(new Date(2026, 5, 24)).index).toBe(-1)
  })

  test('Should run for the configured number of days', () => {
    const { start, end } = sprintForDate(anchor)

    expect((end - start) / DAY_MS).toBe(SPRINT_LENGTH_DAYS)
  })
})

describe('#currentSprint', () => {
  test('Should return the sprint containing now', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 10))

    expect(currentSprint().index).toBe(0)

    vi.useRealTimers()
  })
})

describe('#recentSprints', () => {
  test('Should return the requested number of sprints, newest first', () => {
    const sprints = recentSprints(3, new Date(2026, 7, 5))

    expect(sprints).toHaveLength(3)
    expect(sprints.map((sprint) => sprint.index)).toEqual([2, 1, 0])
  })

  test('Should make each sprint start where the previous one ended', () => {
    const [newest, previous] = recentSprints(2, new Date(2026, 7, 5))

    expect(previous.end).toEqual(newest.start)
  })

  test('Should default to four sprints', () => {
    expect(recentSprints(undefined, anchor)).toHaveLength(4)
  })
})

describe('#formatSprintRange', () => {
  test('Should collapse the month when the sprint stays within it', () => {
    expect(formatSprintRange(new Date(2026, 6, 8), new Date(2026, 6, 22))).toBe(
      '8–21 Jul'
    )
  })

  test('Should name both months when the sprint spans them', () => {
    expect(
      formatSprintRange(new Date(2026, 5, 29), new Date(2026, 6, 13))
    ).toBe('29 Jun–12 Jul')
  })

  test('Should add the year when the sprint spans one', () => {
    expect(
      formatSprintRange(new Date(2026, 11, 28), new Date(2027, 0, 11))
    ).toContain('2027')
  })
})

describe('#formatWindow', () => {
  test('Should describe an arbitrary window with an arrow', () => {
    const label = formatWindow(
      new Date(2026, 6, 8, 9, 0),
      new Date(2026, 6, 9, 17, 30)
    )

    expect(label).toContain('→')
    expect(label).toContain('Jul')
  })
})

describe('#toDateTimeLocal', () => {
  test('Should format a date for a datetime-local input', () => {
    expect(toDateTimeLocal(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07')
  })

  test('Should accept an ISO string', () => {
    expect(toDateTimeLocal(new Date(2026, 6, 8, 14, 30).toISOString())).toBe(
      '2026-07-08T14:30'
    )
  })
})
