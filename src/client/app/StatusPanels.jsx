import { NotificationBanner } from '../components/govuk'
import { Panel, PanelState } from '../components/dashboard'

const OFFLINE_HEADLINE = {
  reconnecting: 'Live updates paused: reconnecting to the analytics service.',
  closed: 'Live updates paused: we cannot reach the analytics service.',
  error: 'Live updates paused: we cannot reach the analytics service.'
}

export function ConnectionBanner({ status, lastUpdated }) {
  const headline = OFFLINE_HEADLINE[status]
  if (!headline) {
    return null
  }
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

export function LoadingPanels({ count }) {
  return (
    <div className="app-grid">
      {Array.from({ length: count }, (_, i) => `loading-${i}`).map((id) => (
        // Plain divs: identically named sections would be duplicate landmarks.
        <Panel key={id} as="div" className="app-span-3" title="Loading…" busy>
          <PanelState state="loading" title="dashboard data" />
        </Panel>
      ))}
    </div>
  )
}

export function ViewSkeleton() {
  return <LoadingPanels count={4} />
}
