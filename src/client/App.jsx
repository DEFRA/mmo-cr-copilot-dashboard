import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  CascadeBreadcrumbs,
  Panel,
  PanelState,
  PeriodFilter,
  PeriodLabelContext,
  ProjectSwitcher
} from './components/dashboard'
import { NotificationBanner } from './components/govuk'
import { AppLayout } from './components/layout/AppLayout'
import { Hero } from './components/layout/Hero'
import { ServiceNavigation } from './components/layout/ServiceNavigation'
import { useLiveFeed } from './hooks/useLiveFeed'
import { usePersonaMappings } from './hooks/usePersonaMappings'
import { useCommitClassification } from './hooks/useCommitClassification'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useProjects } from './hooks/useProjects'
import { useProjectSprints } from './hooks/useProjectSprints'
import { useDeliveryMetrics } from './hooks/useDeliveryMetrics'
import { useDeliveryTrend } from './hooks/useDeliveryTrend'
import { useLeverageV2, useProjectMetric } from './hooks/useProjectMetric'
import {
  shortRepoName,
  filterPayloadsByWindow,
  isPlottablePayload,
  selectContributorSummaries
} from './lib/selectors'
import { hasJira } from './lib/jira'
import { buildContributorPersonaMap } from './lib/personas'
import { canAdministerProject } from './lib/roles'
import { fromHash, isGlobalLevel, toHash } from './lib/routes'
import { currentSprint, recentSprints } from './lib/sprints'
import { confirmDiscard } from './lib/unsaved'

const OverviewView = lazy(() =>
  import('./components/views/OverviewView').then((m) => ({
    default: m.OverviewView
  }))
)
const RepoView = lazy(() =>
  import('./components/views/RepoView').then((m) => ({ default: m.RepoView }))
)
const DeliveryView = lazy(() =>
  import('./components/views/DeliveryView').then((m) => ({
    default: m.DeliveryView
  }))
)
const TicketView = lazy(() =>
  import('./components/views/DeliveryView').then((m) => ({
    default: m.TicketView
  }))
)
const LeverageView = lazy(() =>
  import('./components/views/LeverageView').then((m) => ({
    default: m.LeverageView
  }))
)
const AiNativeOverviewView = lazy(() =>
  import('./components/views/AiNativeOverviewView').then((m) => ({
    default: m.AiNativeOverviewView
  }))
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
const AccessibilityStatementView = lazy(() =>
  import('./components/views/AccessibilityStatementView').then((m) => ({
    default: m.AccessibilityStatementView
  }))
)
const UnauthorisedView = lazy(() =>
  import('./components/views/UnauthorisedView').then((m) => ({
    default: m.UnauthorisedView
  }))
)
const AdminProjectsView = lazy(() =>
  import('./components/views/AdminProjectsView').then((m) => ({
    default: m.AdminProjectsView
  }))
)
const OnboardingView = lazy(() =>
  import('./components/views/OnboardingView').then((m) => ({
    default: m.OnboardingView
  }))
)
const HelpView = lazy(() =>
  import('./components/views/HelpView').then((m) => ({ default: m.HelpView }))
)
const CookiesView = lazy(() =>
  import('./components/views/CookiesView').then((m) => ({
    default: m.CookiesView
  }))
)
const PrivacyView = lazy(() =>
  import('./components/views/PrivacyView').then((m) => ({
    default: m.PrivacyView
  }))
)
const CopilotUsageView = lazy(() =>
  import('./components/views/CopilotUsageView').then((m) => ({
    default: m.CopilotUsageView
  }))
)
const PullRequestsView = lazy(() =>
  import('./components/views/PullRequestsView').then((m) => ({
    default: m.PullRequestsView
  }))
)
const ContributorsView = lazy(() =>
  import('./components/views/ContributorsView').then((m) => ({
    default: m.ContributorsView
  }))
)

// Service-wide pages with no hero, breadcrumbs or period filter.
const PLAIN_PAGES = new Set([
  'accessibility',
  'adminProjects',
  'cookies',
  'help',
  'onboarding',
  'privacy'
])

const SERVICE_NAME = 'Copilot Delivery Insights'
const PROJECT_NAME = 'MMO Catch Recording'

// Service navigation and footer ids, and the page each one opens.
const TOP_LEVEL = {
  overview: { level: 'overview' },
  repositories: { level: 'overview', section: 'repositories' },
  'pull-requests': { level: 'pullRequests' },
  contributors: { level: 'contributors' },
  delivery: { level: 'delivery' },
  settings: { level: 'settings' },
  onboarding: { level: 'onboarding' },
  help: { level: 'help' },
  accessibility: { level: 'accessibility' },
  cookies: { level: 'cookies' },
  privacy: { level: 'privacy' }
}

const NAV_LABELS = [
  ['overview', 'Overview'],
  ['repositories', 'Repositories'],
  ['pull-requests', 'Pull requests'],
  ['contributors', 'Contributors'],
  ['delivery', 'Delivery'],
  ['settings', 'Settings']
]
const ONBOARDING_LABEL = ['onboarding', 'Onboarding']
const HELP_LABEL = ['help', 'Help']

function activeNavId(nav) {
  if (nav.section === 'repositories') return 'repositories'
  switch (nav.level) {
    case 'pullRequests':
      return 'pull-requests'
    case 'contributors':
    case 'contributor':
      return 'contributors'
    case 'delivery':
    case 'ticket':
      return 'delivery'
    case 'settings':
    case 'adminProjects':
      return 'settings'
    case 'onboarding':
      return 'onboarding'
    case 'help':
      return 'help'
    default:
      return PLAIN_PAGES.has(nav.level) ? null : 'overview'
  }
}

const withProject = (nav, slug) =>
  isGlobalLevel(nav.level) || nav.project || !slug
    ? nav
    : { ...nav, project: slug }

function useScrollRestoration(pendingScroll, deps) {
  useEffect(() => {
    const target = pendingScroll.current
    if (!target) return undefined
    let frame = 0
    let id
    const attempt = () => {
      if (target.section) {
        const el = document.getElementById(target.section)
        if (el) {
          el.scrollIntoView?.({ block: 'start' })
          pendingScroll.current = null
          return
        }
      } else if (
        document.documentElement.scrollHeight >=
          target.y + window.innerHeight ||
        frame > 60
      ) {
        window.scrollTo?.(0, target.y)
        pendingScroll.current = null
        return
      }
      frame += 1
      // Lazy views and late data grow the page; keep trying for about a second.
      if (frame <= 60) id = window.requestAnimationFrame(attempt)
    }
    id = window.requestAnimationFrame(attempt)
    return () => window.cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const OFFLINE_HEADLINE = {
  reconnecting: 'Live updates paused: reconnecting to the analytics service.',
  closed: 'Live updates paused: we cannot reach the analytics service.',
  error: 'Live updates paused: we cannot reach the analytics service.'
}

function ConnectionBanner({ status, lastUpdated }) {
  const headline = OFFLINE_HEADLINE[status]
  if (!headline) return null
  return (
    <NotificationBanner>
      <p className="govuk-notification-banner__heading">{headline}</p>
      <p className="govuk-body govuk-!-margin-bottom-0">
        {lastUpdated
          ? `Showing data from ${lastUpdated}.`
          : 'No data has loaded yet.'}{' '}
        Trying again automatically.
      </p>
    </NotificationBanner>
  )
}

function LoadingPanels({ count }) {
  return (
    <div className="app-grid">
      {Array.from({ length: count }).map((_, i) => (
        // Plain divs: identically named sections would be duplicate landmarks.
        <Panel key={i} as="div" className="app-span-3" title="Loading…" busy>
          <PanelState state="loading" title="dashboard data" />
        </Panel>
      ))}
    </div>
  )
}

function ViewSkeleton() {
  return <LoadingPanels count={4} />
}

export default function App() {
  const [nav, setNav] = useState(() => fromHash(window.location.hash))
  const pendingScroll = useRef(null)
  const shownHash = useRef(window.location.hash)
  const unsaved = useRef(false)
  const setUnsaved = useCallback((dirty) => {
    unsaved.current = dirty
  }, [])
  const {
    projects,
    activeProject,
    selectProject,
    status: projectsStatus,
    loading: projectsLoading,
    refresh: refreshProjects
  } = useProjects()
  const activeSlug = activeProject?.slug
  const { user, isAdmin, status: userStatus } = useCurrentUser()
  const { payloads, status, lastMessageAt, applyPayload } = useLiveFeed({
    projectSlug: activeProject?.slug
  })
  const personaMappings = usePersonaMappings(activeSlug)
  const changeCommitClassification = useCommitClassification(applyPayload)
  const mappingsByHandle = useMemo(
    () => buildContributorPersonaMap(personaMappings.mappings),
    [personaMappings.mappings]
  )
  const projectName = activeProject?.name || PROJECT_NAME
  const role = activeProject?.role ?? null
  const canAdminister = canAdministerProject(role)
  // Deny by default: a signed-in user with no project role sees nothing.
  const noAccess = projectsStatus === 'success' && projects.length === 0
  const projectsFailed = projectsStatus === 'error'

  // ── Global time-window filter ──────────────────────────────────────────────
  // Live = the current sprint; custom = a user-selected [start, end) range.
  const [filter, setFilter] = useState({ mode: 'live', start: null, end: null })
  const { sprints: projectSprints } = useProjectSprints(activeSlug)
  // Server windows are used only when the newest one really contains today.
  const serverSprints = useMemo(() => {
    const now = Date.now()
    const live = projectSprints[0]
    return live && live.start.getTime() <= now && now < live.end.getTime()
      ? projectSprints
      : []
  }, [projectSprints])
  const liveWindow = useMemo(
    () => serverSprints[0] ?? currentSprint(),
    [serverSprints]
  )

  const activeWindow = useMemo(
    () =>
      filter.mode === 'live'
        ? { start: liveWindow.start, end: liveWindow.end }
        : { start: filter.start, end: filter.end },
    [filter, liveWindow]
  )

  // A past period shows SonarCloud as at its last second; the live sprint shows today's state.
  const sonarAsOf = useMemo(
    () =>
      filter.mode === 'live'
        ? undefined
        : new Date(new Date(activeWindow.end).getTime() - 1000).toISOString(),
    [filter.mode, activeWindow]
  )
  const trendSprints = useMemo(
    () => (serverSprints.length > 0 ? serverSprints : recentSprints(4)),
    [serverSprints]
  )

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

  const jiraConnected = hasJira(activeProject)
  const isNative = activeProject?.type === 'ai-native'
  const nativeOverview = isNative && nav.level === 'overview'
  const delivery = useDeliveryMetrics(
    jiraConnected &&
      (nav.level === 'delivery' ||
        nav.level === 'ticket' ||
        nav.level === 'overview')
      ? activeSlug
      : null,
    activeWindow
  )
  const deliveryTrend = useDeliveryTrend(
    jiraConnected && nav.level === 'delivery' ? activeSlug : null,
    trendSprints
  )
  const nativeLeverage = useProjectMetric(
    nativeOverview ? activeSlug : null,
    'ai-native-leverage',
    activeWindow
  )
  const nativeChurn = useProjectMetric(
    nativeOverview ? activeSlug : null,
    'churn',
    activeWindow
  )
  const leverage = useLeverageV2(
    nav.level === 'leverage' || (nav.level === 'overview' && !isNative)
      ? activeSlug
      : null,
    activeWindow
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
  const contributorHandles = useMemo(
    () =>
      selectContributorSummaries(allPayloads)
        .map((c) => c.contributor)
        .sort((a, b) => a.localeCompare(b)),
    [allPayloads]
  )

  const navigate = useCallback(
    (target, { confirmed = false } = {}) => {
      if (!confirmed && !confirmDiscard(unsaved.current)) return
      const next = withProject(target, activeSlug)
      window.history.replaceState(
        { ...window.history.state, scrollY: window.scrollY },
        ''
      )
      const hash = toHash(next)
      if (window.location.hash !== hash) {
        window.history.pushState(
          { scrollY: 0, section: next.section ?? null },
          '',
          hash
        )
      }
      shownHash.current = window.location.hash
      pendingScroll.current = next.section
        ? { section: next.section }
        : { y: 0 }
      setNav(next)
    },
    [activeSlug]
  )

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
    // A hash link or Back fires popstate and hashchange; the second sees the hash already shown.
    const onLocationChange = () => {
      const hash = window.location.hash
      if (hash !== shownHash.current && !confirmDiscard(unsaved.current)) {
        window.history.replaceState(
          window.history.state,
          '',
          shownHash.current || window.location.pathname + window.location.search
        )
        return
      }
      shownHash.current = hash
      setNav(fromHash(hash))
      pendingScroll.current = { y: window.history.state?.scrollY ?? 0 }
    }
    window.addEventListener('popstate', onLocationChange)
    window.addEventListener('hashchange', onLocationChange)
    return () => {
      window.removeEventListener('popstate', onLocationChange)
      window.removeEventListener('hashchange', onLocationChange)
    }
  }, [])

  // A legacy or unscoped link gets the active project written into the URL.
  useEffect(() => {
    if (isGlobalLevel(nav.level) || nav.project || !activeSlug) return
    const canonical = { ...nav, project: activeSlug }
    window.history.replaceState(window.history.state, '', toHash(canonical))
    shownHash.current = window.location.hash
    setNav(canonical)
  }, [nav, activeSlug])

  const projectKnown = projects.some((p) => p.slug === nav.project)
  const projectUnavailable =
    Boolean(nav.project) && !projectsLoading && !projectKnown

  // A shared link switches to its project without adding a history entry.
  useEffect(() => {
    if (nav.project && projectKnown && nav.project !== activeSlug) {
      selectProject(nav.project)
    }
  }, [nav.project, projectKnown, activeSlug, selectProject])

  useScrollRestoration(pendingScroll, [nav, payloads.length])

  const handleSelectProject = useCallback(
    (slug) => navigate({ level: 'overview', project: slug }),
    [navigate]
  )

  // Identifies the active time window; used to restart the commit-stream replay
  // when the filter changes (but not when live data merely appends).
  const windowKey = useMemo(
    () =>
      filter.mode === 'live'
        ? `${activeProject?.slug}:live:${liveWindow.start.getTime()}-${liveWindow.end.getTime()}`
        : `${activeProject?.slug}:custom:${new Date(filter.start).getTime()}-${new Date(filter.end).getTime()}`,
    [activeProject?.slug, filter, liveWindow]
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
    (repository) => navigate({ level: 'repo', repository }),
    [navigate]
  )
  const openRepoCycle = useCallback(
    (repository) => navigate({ level: 'repoCycle', repository }),
    [navigate]
  )
  const openPR = useCallback(
    (repository, prNumber) => navigate({ level: 'pr', repository, prNumber }),
    [navigate]
  )
  const openContributor = useCallback(
    (contributor, repository) =>
      navigate(
        typeof repository === 'string'
          ? { level: 'contributor', contributor, repository }
          : { level: 'contributor', contributor }
      ),
    [navigate]
  )
  const openTopLevel = useCallback(
    (id) => navigate(TOP_LEVEL[id] ?? TOP_LEVEL.overview),
    [navigate]
  )
  const openTicket = useCallback(
    (ticket) => navigate({ level: 'ticket', ticket }),
    [navigate]
  )
  const openLeverage = useCallback(
    () => navigate({ level: 'leverage' }),
    [navigate]
  )
  const goHome = useCallback(() => navigate({ level: 'overview' }), [navigate])
  const openOnboarding = useCallback(
    () => navigate({ level: 'onboarding' }),
    [navigate]
  )

  const navItems = useMemo(
    () =>
      [
        ...NAV_LABELS.filter(([id]) => id !== 'delivery' || jiraConnected),
        ...(isAdmin ? [ONBOARDING_LABEL] : []),
        HELP_LABEL
      ].map(([id, label]) => ({
        id,
        label,
        href: toHash(withProject(TOP_LEVEL[id], activeSlug))
      })),
    [activeSlug, isAdmin, jiraConnected]
  )

  const insightsHref = useMemo(
    () => toHash(withProject({ level: 'copilotUsage' }, activeSlug)),
    [activeSlug]
  )

  const handleSaveMapping = personaMappings.upsert
  const handleRemoveMapping = personaMappings.remove

  const activeView = useMemo(() => {
    if (nav.level === 'accessibility') {
      return <AccessibilityStatementView onBack={goHome} />
    }
    if (nav.level === 'adminProjects') {
      if (!isAdmin) {
        return (
          <Panel title="You cannot manage projects" icon="warning">
            <p className="govuk-body">
              You need the Dashboard admin role to manage projects.
            </p>
          </Panel>
        )
      }
      return (
        <AdminProjectsView
          onNavigateHome={goHome}
          onOnboardProject={openOnboarding}
          onProjectsChanged={refreshProjects}
        />
      )
    }
    if (nav.level === 'help') {
      return (
        <HelpView
          onBack={goHome}
          isAdmin={isAdmin}
          onOnboardProject={openOnboarding}
        />
      )
    }
    if (nav.level === 'onboarding') {
      // Wait for the profile so an admin is not told they are refused.
      if (userStatus === 'loading') return <ViewSkeleton />
      return (
        <OnboardingView
          allowed={isAdmin}
          step={nav.step}
          onStepChange={(step) => navigate({ level: 'onboarding', step })}
          onProjectCreated={refreshProjects}
          onLaunch={(slug) => navigate({ level: 'overview', project: slug })}
          onNavigateHome={goHome}
        />
      )
    }
    if (nav.level === 'cookies' || nav.level === 'privacy') {
      const Page = nav.level === 'cookies' ? CookiesView : PrivacyView
      return <Page onBack={goHome} />
    }
    if (projectsLoading) return <ViewSkeleton />
    if (projectsFailed) {
      return (
        <Panel title="Projects not available" icon="warning">
          <PanelState
            state="error"
            title="Projects"
            errorMessage="We could not load your projects. Try again later."
          />
        </Panel>
      )
    }
    if (noAccess) {
      return isAdmin ? (
        <Panel title="No projects yet" icon="warning">
          <PanelState
            state="empty"
            emptyTag="No projects"
            emptyMessage="No project has been added yet."
          />
          <p className="govuk-body">
            <a
              className="govuk-link"
              href={toHash({ level: 'onboarding' })}
              onClick={(event) => {
                event.preventDefault()
                openOnboarding()
              }}
            >
              Add a project
            </a>
          </p>
        </Panel>
      ) : (
        <UnauthorisedView reason="no-access" userName={user?.name} />
      )
    }
    if (nav.level === 'settings') {
      return (
        <SettingsView
          project={activeProject}
          role={role}
          projects={projects}
          isDashboardAdmin={isAdmin}
          mappings={personaMappings.mappings}
          status={personaMappings.status}
          error={personaMappings.error}
          onSave={handleSaveMapping}
          onRemove={handleRemoveMapping}
          contributors={contributorHandles}
          tab={nav.tab}
          onTabChange={(tab) =>
            navigate({ level: 'settings', tab }, { confirmed: true })
          }
          onUnsavedChange={setUnsaved}
        />
      )
    }
    if (projectUnavailable) {
      const fallback = projects[0]
      return (
        <UnauthorisedView
          reason="project"
          userName={user?.name}
          fallbackName={fallback?.name}
          fallbackHref={
            fallback
              ? toHash({ level: 'overview', project: fallback.slug })
              : undefined
          }
        />
      )
    }
    if (nav.level === 'delivery') {
      return (
        <DeliveryView
          delivery={delivery}
          trend={deliveryTrend}
          payloads={visiblePayloads}
          window={activeWindow}
          jiraConnected={jiraConnected}
          canAdminister={canAdminister || isAdmin}
          onOpenTicket={openTicket}
          onOpenPR={openPR}
        />
      )
    }
    if (nav.level === 'leverage') {
      return <LeverageView leverage={leverage} />
    }
    if (nav.level === 'ticket') {
      return (
        <TicketView
          ticketKey={nav.ticket}
          delivery={delivery}
          payloads={allPayloads}
          jiraConnected={jiraConnected}
          onOpenTicket={openTicket}
          onOpenPR={openPR}
        />
      )
    }
    if (payloads.length === 0 && status === 'connecting') {
      return <LoadingPanels count={8} />
    }
    if (payloads.length === 0 && (status === 'closed' || status === 'error')) {
      return (
        <Panel title="No data" icon="warning">
          <PanelState
            state="empty"
            emptyTag="Not available"
            emptyMessage="The analytics backend is not reachable. Start the backend server to see live data."
          />
        </Panel>
      )
    }
    if (payloads.length > 0 && visiblePayloads.length === 0) {
      return (
        <Panel title="No data in this time window" icon="calendar">
          <PanelState
            state="empty"
            emptyMessage="No pull requests fall inside the selected range. Widen the window or return to live."
          />
        </Panel>
      )
    }
    switch (nav.level) {
      case 'repo':
        return (
          <RepoView
            payloads={visiblePayloads}
            allPayloads={allPayloads}
            repository={nav.repository}
            projectSlug={activeSlug}
            jiraConnected={jiraConnected}
            window={activeWindow}
            onOpenLeverage={openLeverage}
            onOpenPR={openPR}
            onOpenContributor={openContributor}
            sonarAsOf={sonarAsOf}
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
            canReclassify={canAdminister}
            projectSlug={activeSlug}
            jiraConnected={jiraConnected}
          />
        )
      case 'contributor':
        return (
          <ContributorView
            payloads={visiblePayloads}
            contributor={nav.contributor}
            repository={nav.repository}
            onOpenPR={openPR}
          />
        )
      case 'copilotUsage':
        return <CopilotUsageView payloads={visiblePayloads} />
      case 'pullRequests':
        return <PullRequestsView payloads={visiblePayloads} onOpenPR={openPR} />
      case 'contributors':
        return (
          <ContributorsView
            payloads={visiblePayloads}
            onOpenContributor={openContributor}
            projectType={activeProject?.type}
          />
        )
      default:
        if (isNative) {
          return (
            <AiNativeOverviewView
              projectSlug={activeSlug}
              payloads={visiblePayloads}
              windowKey={windowKey}
              window={activeWindow}
              delivery={delivery}
              leverage={nativeLeverage}
              churn={nativeChurn}
              jiraConnected={jiraConnected}
              canAdminister={canAdminister || isAdmin}
              onOpenRepo={openRepo}
              onOpenTicket={openTicket}
              onOpenPR={openPR}
              sonarAsOf={sonarAsOf}
              sprintWindows={trendSprints}
              insightsHref={insightsHref}
            />
          )
        }
        return (
          <OverviewView
            projectSlug={activeSlug}
            payloads={visiblePayloads}
            allPayloads={allPayloads}
            windowKey={windowKey}
            projectType={activeProject?.type}
            mappingsByHandle={mappingsByHandle}
            personaStatus={personaMappings.status}
            onOpenRepo={openRepo}
            onOpenRepoCycle={openRepoCycle}
            onOpenContributor={openContributor}
            onOpenLeverage={openLeverage}
            leverageData={leverage.data}
            sonarAsOf={sonarAsOf}
            sprintWindows={trendSprints}
            jiraConnected={jiraConnected}
            canAdminister={canAdminister || isAdmin}
            jiraDelivery={delivery}
            deliveryWindow={activeWindow}
            deliveryHref={toHash(
              withProject({ level: 'delivery' }, activeSlug)
            )}
            onOpenTicket={openTicket}
            onOpenPR={openPR}
            insightsHref={insightsHref}
          />
        )
    }
  }, [
    insightsHref,
    nav,
    payloads,
    visiblePayloads,
    allPayloads,
    status,
    windowKey,
    sonarAsOf,
    trendSprints,
    mappingsByHandle,
    personaMappings.mappings,
    personaMappings.status,
    personaMappings.error,
    contributorHandles,
    handleSaveMapping,
    handleRemoveMapping,
    changeCommitClassification,
    isAdmin,
    canAdminister,
    role,
    activeProject,
    projectsLoading,
    projectsFailed,
    noAccess,
    user,
    navigate,
    activeSlug,
    delivery,
    deliveryTrend,
    activeWindow,
    jiraConnected,
    openTicket,
    openLeverage,
    leverage,
    isNative,
    nativeLeverage,
    nativeChurn,
    openRepo,
    openRepoCycle,
    openPR,
    openContributor,
    goHome,
    openOnboarding,
    refreshProjects,
    setUnsaved,
    userStatus,
    projectUnavailable,
    projects
  ])

  const heading = {
    overview: 'Project Overview',
    repo: shortRepoName(nav.repository ?? ''),
    repoCycle: `${shortRepoName(nav.repository ?? '')} · PR Coding Cycle Time`,
    pr: `Pull Request #${nav.prNumber}`,
    contributor: nav.contributor,
    pullRequests: 'Pull Requests',
    contributors: 'Contributors',
    delivery: 'Delivery',
    ticket: nav.ticket,
    leverage: 'Copilot Leverage',
    copilotUsage: 'Copilot Usage Insights',
    settings: 'Settings',
    accessibility: 'Accessibility Statement',
    adminProjects: 'Manage Projects',
    onboarding: 'Onboard a Project',
    help: 'Help',
    cookies: 'Cookies',
    privacy: 'Privacy'
  }[nav.level]

  return (
    <AppLayout
      serviceName={SERVICE_NAME}
      projectName={projectName}
      user={user}
      projectSwitcher={
        activeProject ? (
          <ProjectSwitcher
            projects={projects}
            activeProject={activeProject}
            onSelectProject={handleSelectProject}
            onManageProjects={
              isAdmin ? () => navigate({ level: 'adminProjects' }) : undefined
            }
          />
        ) : null
      }
      navigation={
        noAccess && !isAdmin ? null : (
          <ServiceNavigation
            items={navItems}
            activeId={activeNavId(nav)}
            onNavigate={openTopLevel}
          />
        )
      }
      hero={
        PLAIN_PAGES.has(nav.level) || noAccess || projectsFailed ? null : (
          <Hero
            serviceName={SERVICE_NAME}
            caption={projectName}
            heading={heading}
            breadcrumbs={
              <CascadeBreadcrumbs
                nav={nav}
                projectName={projectName}
                onNavigate={navigate}
              />
            }
            controls={
              <PeriodFilter
                mode={filter.mode}
                start={activeWindow.start}
                end={activeWindow.end}
                onGoLive={goLive}
                onApplyRange={applyRange}
                sprintWindows={serverSprints}
              />
            }
            notices={
              <ConnectionBanner status={status} lastUpdated={lastUpdated} />
            }
          />
        )
      }
      onNavigate={openTopLevel}
    >
      <ErrorBoundary>
        <PeriodLabelContext.Provider
          value={filter.mode === 'live' ? 'Live sprint' : 'Selected period'}
        >
          <Suspense fallback={<ViewSkeleton />}>{activeView}</Suspense>
        </PeriodLabelContext.Provider>
      </ErrorBoundary>
    </AppLayout>
  )
}
