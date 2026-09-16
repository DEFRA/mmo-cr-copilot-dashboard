import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Header } from './components/Header'
import { Breadcrumb } from './components/Breadcrumb'
import { Panel } from './components/Panel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useTheme } from './hooks/useTheme'
import { useLiveFeed } from './hooks/useLiveFeed'
import { usePersonaMappings } from './hooks/usePersonaMappings'
import { useCommitClassification } from './hooks/useCommitClassification'
import {
  shortRepoName,
  filterPayloadsByWindow,
  isPlottablePayload
} from './lib/selectors'
import { buildContributorPersonaMap } from './lib/personas'
import {
  currentSprint,
  recentSprints,
  formatSprintRange,
  formatWindow
} from './lib/sprints'

const OverviewView = lazy(() =>
  import('./components/views/OverviewView').then((m) => ({
    default: m.OverviewView
  }))
)
const RepoView = lazy(() =>
  import('./components/views/RepoView').then((m) => ({ default: m.RepoView }))
)
const PRView = lazy(() =>
  import('./components/views/PRView').then((m) => ({ default: m.PRView }))
)
const ContributorView = lazy(() =>
  import('./components/views/ContributorView').then((m) => ({
    default: m.ContributorView
  }))
)
const RepoCycleTimeView = lazy(() =>
  import('./components/views/RepoCycleTimeView').then((m) => ({
    default: m.RepoCycleTimeView
  }))
)
const SettingsView = lazy(() =>
  import('./components/views/SettingsView').then((m) => ({
    default: m.SettingsView
  }))
)

const ROOT_NAV = { level: 'overview' }

const STATUS_LABEL = {
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
  closed: 'Offline',
  error: 'Error'
}

function ConnectionBanner({ status }) {
  if (status === 'open') return null
  const isHard = status === 'closed' || status === 'error'
  const sev = isHard ? 'var(--color-danger)' : 'var(--color-warning)'
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b px-4 py-2 text-sm font-medium"
      style={{
        background: `color-mix(in srgb, ${sev} 16%, var(--color-surface))`,
        borderColor: `color-mix(in srgb, ${sev} 50%, var(--color-border))`,
        color: 'var(--color-text)'
      }}
    >
      <span aria-hidden="true" style={{ color: sev }}>
        {isHard ? '✕' : '↻'}
      </span>
      {STATUS_LABEL[status]} —{' '}
      {isHard
        ? 'Unable to reach backend.'
        : 'Attempting to reconnect to the analytics backend…'}
      {isHard && (
        <span className="opacity-75">
          Retrying automatically — the last known data is still shown.
        </span>
      )}
    </div>
  )
}

function ViewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Panel key={i} state="loading" title="Loading…" />
      ))}
    </div>
  )
}

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [nav, setNav] = useState(ROOT_NAV)
  const { payloads, status, lastMessageAt, applyPayload } = useLiveFeed()
  const personaMappings = usePersonaMappings()
  const changeCommitClassification = useCommitClassification(applyPayload)
  const mappingsByHandle = useMemo(
    () => buildContributorPersonaMap(personaMappings.mappings),
    [personaMappings.mappings]
  )

  // ── Global time-window filter ──────────────────────────────────────────────
  // Live = the current sprint; custom = a user-selected [start, end) range.
  const [filter, setFilter] = useState({ mode: 'live', start: null, end: null })
  const liveWindow = useMemo(() => currentSprint(), [])

  const activeWindow = useMemo(
    () =>
      filter.mode === 'live'
        ? { start: liveWindow.start, end: liveWindow.end }
        : { start: filter.start, end: filter.end },
    [filter, liveWindow]
  )

  const windowLabel = useMemo(
    () =>
      filter.mode === 'live'
        ? `Sprint · ${formatSprintRange(liveWindow.start, liveWindow.end)}`
        : formatWindow(filter.start, filter.end),
    [filter, liveWindow]
  )

  const presets = useMemo(() => {
    const sprints = recentSprints(3)
    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    return [
      {
        id: 'live',
        label: `Current sprint · ${formatSprintRange(sprints[0].start, sprints[0].end)}`,
        isLive: true
      },
      {
        id: 'prev',
        label: `Previous sprint · ${formatSprintRange(sprints[1].start, sprints[1].end)}`,
        start: sprints[1].start,
        end: sprints[1].end
      },
      {
        id: 'prev2',
        label: `Sprint · ${formatSprintRange(sprints[2].start, sprints[2].end)}`,
        start: sprints[2].start,
        end: sprints[2].end
      },
      {
        id: '7d',
        label: 'Last 7 days',
        start: new Date(now.getTime() - 7 * day),
        end: now
      },
      {
        id: '24h',
        label: 'Last 24 hours',
        start: new Date(now.getTime() - day),
        end: now
      }
    ]
  }, [])

  const goLive = useCallback(
    () => setFilter({ mode: 'live', start: null, end: null }),
    []
  )
  const applyRange = useCallback(
    (start, end) => setFilter({ mode: 'custom', start, end }),
    []
  )

  const visiblePayloads = useMemo(
    () =>
      filterPayloadsByWindow(
        payloads,
        activeWindow.start,
        activeWindow.end
      ).filter(isPlottablePayload),
    [payloads, activeWindow]
  )

  // Full, un-windowed history (still validity-filtered) — used only for the
  // Copilot Leverage "manual baseline": median cycle time is stable enough
  // that it doesn't need to be restricted to the currently selected sprint,
  // and restricting it is what causes the baseline to run out once a
  // repository is almost entirely Copilot-led in the active window.
  const allPayloads = useMemo(
    () => payloads.filter(isPlottablePayload),
    [payloads]
  )

  // Identifies the active time window; used to restart the commit-stream replay
  // when the filter changes (but not when live data merely appends).
  const windowKey = useMemo(
    () =>
      filter.mode === 'live'
        ? `live:${liveWindow.start.getTime()}-${liveWindow.end.getTime()}`
        : `custom:${new Date(filter.start).getTime()}-${new Date(filter.end).getTime()}`,
    [filter, liveWindow]
  )

  const lastUpdated = useMemo(() => {
    if (lastMessageAt) {
      return lastMessageAt.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    }
    return null
  }, [lastMessageAt])

  const openRepo = useCallback(
    (repository) => setNav({ level: 'repo', repository }),
    []
  )
  const openRepoCycle = useCallback(
    (repository) => setNav({ level: 'repoCycle', repository }),
    []
  )
  const openPR = useCallback(
    (repository, prNumber) => setNav({ level: 'pr', repository, prNumber }),
    []
  )
  const openContributor = useCallback(
    (contributor) => setNav({ level: 'contributor', contributor }),
    []
  )
  const openSettings = useCallback(() => setNav({ level: 'settings' }), [])
  const handleSaveMapping = personaMappings.upsert
  const handleRemoveMapping = personaMappings.remove

  const crumbs = useMemo(() => {
    const items = [
      { key: 'overview', label: 'All Repositories', nav: ROOT_NAV }
    ]
    if (nav.level === 'settings') {
      items.push({ key: 'settings', label: 'Settings', nav })
    }
    if (
      nav.level === 'repo' ||
      nav.level === 'pr' ||
      nav.level === 'repoCycle'
    ) {
      items.push({
        key: `repo:${nav.repository}`,
        label: shortRepoName(nav.repository),
        nav: { level: 'repo', repository: nav.repository }
      })
    }
    if (nav.level === 'repoCycle') {
      items.push({
        key: `cycle:${nav.repository}`,
        label: 'Cycle time',
        nav
      })
    }
    if (nav.level === 'pr') {
      items.push({
        key: `pr:${nav.repository}:${nav.prNumber}`,
        label: `PR #${nav.prNumber}`,
        nav
      })
    }
    if (nav.level === 'contributor') {
      items.push({
        key: `contributor:${nav.contributor}`,
        label: nav.contributor,
        nav
      })
    }
    return items
  }, [nav])

  const activeView = useMemo(() => {
    if (nav.level === 'settings') {
      return (
        <SettingsView
          mappings={personaMappings.mappings}
          status={personaMappings.status}
          error={personaMappings.error}
          onSave={handleSaveMapping}
          onRemove={handleRemoveMapping}
        />
      )
    }
    if (payloads.length === 0 && status === 'connecting') {
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Panel key={i} state="loading" title="Loading…" />
          ))}
        </div>
      )
    }
    if (payloads.length === 0 && (status === 'closed' || status === 'error')) {
      return (
        <Panel
          title="No data"
          state="empty"
          subtitle="The analytics backend is not reachable. Start the backend server to see live data."
        />
      )
    }
    if (payloads.length > 0 && visiblePayloads.length === 0) {
      return (
        <Panel
          title="No data in this time window"
          state="empty"
          subtitle="No pull requests fall inside the selected range. Widen the window or return to live."
        />
      )
    }
    switch (nav.level) {
      case 'repo':
        return (
          <RepoView
            payloads={visiblePayloads}
            repository={nav.repository}
            onOpenPR={openPR}
            onOpenContributor={openContributor}
          />
        )
      case 'repoCycle':
        return (
          <RepoCycleTimeView
            payloads={visiblePayloads}
            repository={nav.repository}
            onOpenPR={openPR}
          />
        )
      case 'pr':
        return (
          <PRView
            payloads={visiblePayloads}
            repository={nav.repository}
            prNumber={nav.prNumber}
            onOpenContributor={openContributor}
            onChangeClassification={changeCommitClassification}
          />
        )
      case 'contributor':
        return (
          <ContributorView
            payloads={visiblePayloads}
            contributor={nav.contributor}
            onOpenPR={openPR}
          />
        )
      default:
        return (
          <OverviewView
            payloads={visiblePayloads}
            allPayloads={allPayloads}
            windowKey={windowKey}
            mappingsByHandle={mappingsByHandle}
            onOpenRepo={openRepo}
            onOpenRepoCycle={openRepoCycle}
            onOpenContributor={openContributor}
          />
        )
    }
  }, [
    nav,
    payloads,
    visiblePayloads,
    allPayloads,
    status,
    windowKey,
    mappingsByHandle,
    personaMappings.mappings,
    personaMappings.status,
    personaMappings.error,
    handleSaveMapping,
    handleRemoveMapping,
    changeCommitClassification,
    openRepo,
    openRepoCycle,
    openPR,
    openContributor
  ])

  const heading = {
    overview: 'Global Overview',
    repo: shortRepoName(nav.repository ?? ''),
    repoCycle: `${shortRepoName(nav.repository ?? '')} · Cycle time`,
    pr: `Pull Request #${nav.prNumber}`,
    contributor: nav.contributor,
    settings: 'Settings'
  }[nav.level]

  return (
    <div className="app-shell flex min-h-full flex-col">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        lastUpdated={lastUpdated}
        connection={
          status === 'open'
            ? 'live'
            : status === 'connecting'
              ? 'live'
              : 'stale'
        }
        filter={{
          mode: filter.mode,
          start: activeWindow.start,
          end: activeWindow.end,
          label: windowLabel
        }}
        presets={presets}
        onGoLive={goLive}
        onApplyRange={applyRange}
        onOpenSettings={openSettings}
      />
      <ConnectionBanner status={status} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-6"
      >
        {filter.mode === 'custom' && (
          <div className="window-banner mb-4" role="status" aria-live="polite">
            <span aria-hidden="true">🗓</span>
            <span className="text-sm">
              Viewing <strong>{windowLabel}</strong> — historical snapshot, not
              live.
            </span>
            <button
              type="button"
              onClick={goLive}
              className="focus-ring ml-auto rounded-[var(--radius-pill)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)]"
            >
              Return to live
            </button>
          </div>
        )}
        <div className="mb-4 flex flex-col gap-2">
          <Breadcrumb items={crumbs} onNavigate={(item) => setNav(item.nav)} />
          <h2 className="text-xl font-semibold text-[var(--color-text)]">
            {heading}
          </h2>
        </div>
        <ErrorBoundary>
          <Suspense fallback={<ViewSkeleton />}>
            {/* Remount the chart subtree on theme change so ECharts palettes,
                which are read once into each chart's memo, refresh cleanly. */}
            <div key={theme}>{activeView}</div>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
