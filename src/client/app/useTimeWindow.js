import { useCallback, useMemo, useState } from 'react'

import { useProjectSprints } from '../hooks/useProjectSprints'
import { currentSprint, recentSprints } from '../lib/sprints'

const SPRINT_COUNT = 4
const LIVE = { mode: 'live', start: null, end: null }

const calendarKey = (calendar) =>
  calendar ? `${calendar.cadenceDays}|${calendar.anchorDate}` : null

const windowStamp = (start, end) =>
  `${new Date(start).getTime()}-${new Date(end).getTime()}`

/**
 * The global time-window filter: live is the current sprint, custom a chosen
 * [start, end) range. Server sprints are used only when the newest contains today.
 */
export function useTimeWindow(activeSlug, sprintCalendar) {
  const [filter, setFilter] = useState(LIVE)
  const { sprints: projectSprints } = useProjectSprints(
    activeSlug,
    SPRINT_COUNT,
    calendarKey(sprintCalendar)
  )
  const serverSprints = useMemo(() => {
    const now = Date.now()
    const live = projectSprints[0]
    const current =
      live && live.start.getTime() <= now && now < live.end.getTime()
    return current ? projectSprints : []
  }, [projectSprints])
  const liveWindow = useMemo(
    () => serverSprints[0] ?? currentSprint(),
    [serverSprints]
  )
  const isLive = filter.mode === 'live'

  const activeWindow = useMemo(
    () =>
      isLive
        ? { start: liveWindow.start, end: liveWindow.end }
        : { start: filter.start, end: filter.end },
    [isLive, filter, liveWindow]
  )

  // A past period shows SonarCloud as at its last second; the live sprint shows today's state.
  const sonarAsOf = useMemo(
    () =>
      isLive
        ? undefined
        : new Date(new Date(activeWindow.end).getTime() - 1000).toISOString(),
    [isLive, activeWindow]
  )
  const trendSprints = useMemo(
    () =>
      serverSprints.length > 0 ? serverSprints : recentSprints(SPRINT_COUNT),
    [serverSprints]
  )

  // Restarts the commit-stream replay when the window changes, not when data appends.
  const windowKey = isLive
    ? `${activeSlug}:live:${windowStamp(liveWindow.start, liveWindow.end)}`
    : `${activeSlug}:custom:${windowStamp(filter.start, filter.end)}`

  const goLive = useCallback(() => setFilter(LIVE), [])
  const applyRange = useCallback(
    (start, end) => setFilter({ mode: 'custom', start, end }),
    []
  )

  return {
    mode: filter.mode,
    isLive,
    activeWindow,
    serverSprints,
    sonarAsOf,
    trendSprints,
    windowKey,
    goLive,
    applyRange
  }
}
