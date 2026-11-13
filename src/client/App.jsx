import { Suspense, useCallback, useEffect, useMemo } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  CascadeBreadcrumbs,
  PeriodFilter,
  PeriodLabelContext,
  ProjectSwitcher
} from './components/dashboard'
import { AppLayout } from './components/layout/AppLayout'
import { Hero } from './components/layout/Hero'
import { ServiceNavigation } from './components/layout/ServiceNavigation'
import { useLiveFeed } from './hooks/useLiveFeed'
import { usePersonaMappings } from './hooks/usePersonaMappings'
import { useCommitClassification } from './hooks/useCommitClassification'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useProjects } from './hooks/useProjects'
import {
  filterPayloadsByWindow,
  isPlottablePayload,
  selectContributorSummaries
} from './lib/selectors'
import { hasJira } from './lib/jira'
import { buildContributorPersonaMap } from './lib/personas'
import { canAdministerProject } from './lib/roles'
import { toHash } from './lib/routes'
import {
  PLAIN_PAGES,
  PROJECT_NAME,
  SERVICE_NAME,
  activeNavId,
  navigationItems,
  pageHeading,
  withProject
} from './app/navigation.js'
import { renderView } from './app/render-view.jsx'
import { ConnectionBanner, ViewSkeleton } from './app/StatusPanels.jsx'
import { useHashNavigation } from './app/useHashNavigation.js'
import { useOpeners, useProjectData } from './app/useProjectData.js'
import { useScrollRestoration } from './app/useScrollRestoration.js'
import { useTimeWindow } from './app/useTimeWindow.js'

/** The feed in the window, and its full history for baselines and lookups. */
function useFeedPayloads(payloads, activeWindow) {
  const visiblePayloads = useMemo(
    () =>
      filterPayloadsByWindow(
        payloads,
        activeWindow.start,
        activeWindow.end
      ).filter(isPlottablePayload),
    [payloads, activeWindow]
  )
  // Un-windowed history feeds the Copilot Leverage manual baseline, which a
  // single sprint would starve once a repository is almost all Copilot-led.
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
  return { visiblePayloads, allPayloads, contributorHandles }
}

/** Whether the linked project is out of reach; a known one becomes active. */
function useLinkedProject(
  nav,
  { projects, loading, activeSlug, selectProject }
) {
  const projectKnown = projects.some((p) => p.slug === nav.project)

  // A shared link switches to its project without adding a history entry.
  useEffect(() => {
    if (nav.project && projectKnown && nav.project !== activeSlug) {
      selectProject(nav.project)
    }
  }, [nav.project, projectKnown, activeSlug, selectProject])

  return Boolean(nav.project) && !loading && !projectKnown
}

const formatUpdated = (at) =>
  at
    ? at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

function AppHero({
  nav,
  navigate,
  projectName,
  period,
  status,
  lastMessageAt
}) {
  const { mode, activeWindow, goLive, applyRange, serverSprints } = period
  return (
    <Hero
      serviceName={SERVICE_NAME}
      caption={projectName}
      heading={pageHeading(nav)}
      breadcrumbs={
        <CascadeBreadcrumbs
          nav={nav}
          projectName={projectName}
          onNavigate={navigate}
        />
      }
      controls={
        <PeriodFilter
          mode={mode}
          start={activeWindow.start}
          end={activeWindow.end}
          onGoLive={goLive}
          onApplyRange={applyRange}
          sprintWindows={serverSprints}
        />
      }
      notices={
        <ConnectionBanner
          status={status}
          lastUpdated={formatUpdated(lastMessageAt)}
        />
      }
    />
  )
}

/** The signed-in user's projects, role and what they may see. */
function useAccess() {
  const projectsState = useProjects()
  const { projects, activeProject, status } = projectsState
  const currentUser = useCurrentUser()
  const role = activeProject?.role ?? null
  return {
    ...projectsState,
    ...currentUser,
    userStatus: currentUser.status,
    activeSlug: activeProject?.slug,
    projectName: activeProject?.name || PROJECT_NAME,
    role,
    canReclassify: canAdministerProject(role),
    canAdminister: canAdministerProject(role) || currentUser.isAdmin,
    // Deny by default: a signed-in user with no project role sees nothing.
    noAccess: status === 'success' && projects.length === 0,
    projectsFailed: status === 'error',
    projectsLoading: projectsState.loading
  }
}

export default function App() {
  const access = useAccess()
  const { activeProject, activeSlug, isAdmin, noAccess, projectsFailed } =
    access
  const { payloads, status, lastMessageAt, applyPayload } = useLiveFeed({
    projectSlug: activeSlug
  })
  const personaMappings = usePersonaMappings(activeSlug)
  const changeCommitClassification = useCommitClassification(applyPayload)
  const mappingsByHandle = useMemo(
    () => buildContributorPersonaMap(personaMappings.mappings),
    [personaMappings.mappings]
  )
  const { nav, navigate, setUnsaved, pendingScroll } =
    useHashNavigation(activeSlug)
  const period = useTimeWindow(activeSlug, activeProject?.sprintCalendar)
  const feed = useFeedPayloads(payloads, period.activeWindow)
  const jiraConnected = hasJira(activeProject)
  const isNative = activeProject?.type === 'ai-native'
  const data = useProjectData({
    nav,
    slug: activeSlug,
    period: period.activeWindow,
    trendSprints: period.trendSprints,
    jira: jiraConnected,
    native: isNative
  })
  const openers = useOpeners(navigate)
  const { openTopLevel } = openers
  const projectUnavailable = useLinkedProject(nav, {
    projects: access.projects,
    loading: access.projectsLoading,
    activeSlug,
    selectProject: access.selectProject
  })

  useScrollRestoration(pendingScroll, [nav, payloads.length])

  const handleSelectProject = useCallback(
    (slug) => navigate({ level: 'overview', project: slug }),
    [navigate]
  )
  const navItems = useMemo(
    () => navigationItems({ jiraConnected, isAdmin, slug: activeSlug, toHash }),
    [activeSlug, isAdmin, jiraConnected]
  )
  const insightsHref = useMemo(
    () => toHash(withProject({ level: 'copilotUsage' }, activeSlug)),
    [activeSlug]
  )

  const activeView = renderView({
    ...access,
    ...feed,
    nav,
    navigate,
    setUnsaved,
    payloads,
    status,
    personaMappings,
    mappingsByHandle,
    changeCommitClassification,
    period,
    data,
    openers,
    goHome: openers.goHome,
    openOnboarding: openers.openOnboarding,
    refreshProjects: access.refresh,
    jiraConnected,
    isNative,
    insightsHref,
    projectUnavailable
  })
  const plainPage = PLAIN_PAGES.has(nav.level) || noAccess || projectsFailed

  return (
    <AppLayout
      serviceName={SERVICE_NAME}
      projectName={access.projectName}
      user={access.user}
      projectSwitcher={
        activeProject ? (
          <ProjectSwitcher
            projects={access.projects}
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
        plainPage ? null : (
          <AppHero
            nav={nav}
            navigate={navigate}
            projectName={access.projectName}
            period={period}
            status={status}
            lastMessageAt={lastMessageAt}
          />
        )
      }
      onNavigate={openTopLevel}
    >
      <ErrorBoundary>
        <PeriodLabelContext.Provider
          value={period.isLive ? 'Live sprint' : 'Selected period'}
        >
          <Suspense fallback={<ViewSkeleton />}>{activeView}</Suspense>
        </PeriodLabelContext.Provider>
      </ErrorBoundary>
    </AppLayout>
  )
}
