import { Panel, PanelState } from '../components/dashboard'
import { toHash } from '../lib/routes'
import {
  AccessibilityStatementView,
  AdminProjectsView,
  AiNativeOverviewView,
  ContributorView,
  ContributorsView,
  CookiesView,
  CopilotUsageView,
  DeliveryView,
  HelpView,
  LeverageView,
  OnboardingView,
  OverviewView,
  PRView,
  PrivacyView,
  PullRequestsView,
  RepoCycleTimeView,
  RepoView,
  SettingsView,
  TicketView,
  UnauthorisedView
} from './lazy-views.js'
import { withProject } from './navigation.js'
import { LoadingPanels, ViewSkeleton } from './StatusPanels.jsx'

function adminProjectsPage({
  isAdmin,
  goHome,
  openOnboarding,
  refreshProjects
}) {
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

// Waits for the profile so an admin is not told they are refused.
function onboardingPage({
  userStatus,
  isAdmin,
  nav,
  navigate,
  refreshProjects,
  goHome
}) {
  if (userStatus === 'loading') {
    return <ViewSkeleton />
  }
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

const helpPage = ({ goHome, isAdmin, openOnboarding }) => (
  <HelpView
    onBack={goHome}
    isAdmin={isAdmin}
    onOnboardProject={openOnboarding}
  />
)

// Service pages that need no project.
const SERVICE_PAGES = {
  accessibility: ({ goHome }) => <AccessibilityStatementView onBack={goHome} />,
  adminProjects: adminProjectsPage,
  help: helpPage,
  onboarding: onboardingPage,
  cookies: ({ goHome }) => <CookiesView onBack={goHome} />,
  privacy: ({ goHome }) => <PrivacyView onBack={goHome} />
}

function NoProjects({ openOnboarding }) {
  return (
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
  )
}

function accessPage(ctx) {
  if (ctx.projectsLoading) {
    return <ViewSkeleton />
  }
  if (ctx.projectsFailed) {
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
  if (!ctx.noAccess) {
    return null
  }
  return ctx.isAdmin ? (
    <NoProjects openOnboarding={ctx.openOnboarding} />
  ) : (
    <UnauthorisedView reason="no-access" userName={ctx.user?.name} />
  )
}

function settingsPage(ctx) {
  const { navigate, setUnsaved, refreshProjects, personaMappings } = ctx
  const { mappings, status, error, upsert, remove } = personaMappings
  return (
    <SettingsView
      project={ctx.activeProject}
      role={ctx.role}
      projects={ctx.projects}
      isDashboardAdmin={ctx.isAdmin}
      mappings={mappings}
      status={status}
      error={error}
      onSave={upsert}
      onRemove={remove}
      contributors={ctx.contributorHandles}
      tab={ctx.nav.tab}
      onTabChange={(tab) =>
        navigate({ level: 'settings', tab }, { confirmed: true })
      }
      onUnsavedChange={setUnsaved}
      onProjectChanged={refreshProjects}
    />
  )
}

function unavailablePage({ projects, user }) {
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

function deliveryPage(ctx) {
  const { openTicket, openPR } = ctx.openers
  return (
    <DeliveryView
      delivery={ctx.data.delivery}
      trend={ctx.data.deliveryTrend}
      payloads={ctx.visiblePayloads}
      window={ctx.period.activeWindow}
      jiraConnected={ctx.jiraConnected}
      canAdminister={ctx.canAdminister}
      onOpenTicket={openTicket}
      onOpenPR={openPR}
    />
  )
}

function ticketPage(ctx) {
  const { openTicket, openPR } = ctx.openers
  return (
    <TicketView
      ticketKey={ctx.nav.ticket}
      delivery={ctx.data.delivery}
      payloads={ctx.allPayloads}
      jiraConnected={ctx.jiraConnected}
      canAdminister={ctx.canAdminister}
      onOpenTicket={openTicket}
      onOpenPR={openPR}
    />
  )
}

// Jira pages render before the feed has data: they read the delivery API.
const JIRA_PAGES = {
  delivery: deliveryPage,
  leverage: (ctx) => <LeverageView leverage={ctx.data.leverage} />,
  ticket: ticketPage
}

function projectPage(ctx) {
  if (ctx.nav.level === 'settings') {
    return settingsPage(ctx)
  }
  if (ctx.projectUnavailable) {
    return unavailablePage(ctx)
  }
  return Object.hasOwn(JIRA_PAGES, ctx.nav.level)
    ? JIRA_PAGES[ctx.nav.level](ctx)
    : null
}

function feedStatePage({ payloads, status, visiblePayloads }) {
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
  return null
}

function repoPage(ctx) {
  const { openLeverage, openPR, openContributor } = ctx.openers
  return (
    <RepoView
      payloads={ctx.visiblePayloads}
      allPayloads={ctx.allPayloads}
      repository={ctx.nav.repository}
      projectSlug={ctx.activeSlug}
      jiraConnected={ctx.jiraConnected}
      window={ctx.period.activeWindow}
      onOpenLeverage={openLeverage}
      onOpenPR={openPR}
      onOpenContributor={openContributor}
      sonarAsOf={ctx.period.sonarAsOf}
    />
  )
}

function repoCyclePage(ctx) {
  const { openPR } = ctx.openers
  return (
    <RepoCycleTimeView
      payloads={ctx.visiblePayloads}
      repository={ctx.nav.repository}
      onOpenPR={openPR}
    />
  )
}

function prPage(ctx) {
  const { openContributor } = ctx.openers
  const { changeCommitClassification } = ctx
  return (
    <PRView
      // The whole PR, not only this window's commits: it may span sprints.
      payloads={ctx.allPayloads}
      repository={ctx.nav.repository}
      prNumber={ctx.nav.prNumber}
      onOpenContributor={openContributor}
      onChangeClassification={changeCommitClassification}
      canReclassify={ctx.canReclassify}
      projectSlug={ctx.activeSlug}
      jiraConnected={ctx.jiraConnected}
    />
  )
}

function contributorPage(ctx) {
  const { openPR } = ctx.openers
  return (
    <ContributorView
      payloads={ctx.visiblePayloads}
      contributor={ctx.nav.contributor}
      repository={ctx.nav.repository}
      onOpenPR={openPR}
    />
  )
}

function pullRequestsPage(ctx) {
  const { openPR } = ctx.openers
  return <PullRequestsView payloads={ctx.visiblePayloads} onOpenPR={openPR} />
}

function contributorsPage(ctx) {
  const { openContributor } = ctx.openers
  return (
    <ContributorsView
      payloads={ctx.visiblePayloads}
      onOpenContributor={openContributor}
      projectType={ctx.activeProject?.type}
    />
  )
}

const DATA_PAGES = {
  repo: repoPage,
  repoCycle: repoCyclePage,
  pr: prPage,
  contributor: contributorPage,
  copilotUsage: (ctx) => <CopilotUsageView payloads={ctx.visiblePayloads} />,
  pullRequests: pullRequestsPage,
  contributors: contributorsPage
}

function nativeOverview(ctx) {
  const { openRepo, openTicket, openPR } = ctx.openers
  const { activeWindow, windowKey, sonarAsOf, trendSprints } = ctx.period
  return (
    <AiNativeOverviewView
      projectSlug={ctx.activeSlug}
      payloads={ctx.visiblePayloads}
      windowKey={windowKey}
      window={activeWindow}
      delivery={ctx.data.delivery}
      leverage={ctx.data.nativeLeverage}
      churn={ctx.data.nativeChurn}
      jiraConnected={ctx.jiraConnected}
      canAdminister={ctx.canAdminister}
      onOpenRepo={openRepo}
      onOpenTicket={openTicket}
      onOpenPR={openPR}
      sonarAsOf={sonarAsOf}
      sprintWindows={trendSprints}
      insightsHref={ctx.insightsHref}
    />
  )
}

function adoptedOverview(ctx) {
  const {
    openRepo,
    openRepoCycle,
    openContributor,
    openLeverage,
    openTicket,
    openPR
  } = ctx.openers
  const { activeWindow, windowKey, sonarAsOf, trendSprints } = ctx.period
  return (
    <OverviewView
      projectSlug={ctx.activeSlug}
      payloads={ctx.visiblePayloads}
      allPayloads={ctx.allPayloads}
      windowKey={windowKey}
      projectType={ctx.activeProject?.type}
      mappingsByHandle={ctx.mappingsByHandle}
      personaStatus={ctx.personaMappings.status}
      onOpenRepo={openRepo}
      onOpenRepoCycle={openRepoCycle}
      onOpenContributor={openContributor}
      onOpenLeverage={openLeverage}
      leverageData={ctx.data.leverage.data}
      sonarAsOf={sonarAsOf}
      sprintWindows={trendSprints}
      jiraConnected={ctx.jiraConnected}
      canAdminister={ctx.canAdminister}
      jiraDelivery={ctx.data.delivery}
      deliveryWindow={activeWindow}
      deliveryHref={toHash(withProject({ level: 'delivery' }, ctx.activeSlug))}
      onOpenTicket={openTicket}
      onOpenPR={openPR}
      insightsHref={ctx.insightsHref}
    />
  )
}

function dataPage(ctx) {
  if (Object.hasOwn(DATA_PAGES, ctx.nav.level)) {
    return DATA_PAGES[ctx.nav.level](ctx)
  }
  return ctx.isNative ? nativeOverview(ctx) : adoptedOverview(ctx)
}

/** The page for the current route, after access, project and feed checks. */
export function renderView(ctx) {
  if (Object.hasOwn(SERVICE_PAGES, ctx.nav.level)) {
    return SERVICE_PAGES[ctx.nav.level](ctx)
  }
  return (
    accessPage(ctx) ?? projectPage(ctx) ?? feedStatePage(ctx) ?? dataPage(ctx)
  )
}
