import { NotificationBanner } from '../govuk'

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC'
})
export const formatDateTime = (ms) => DATE_TIME.format(ms)

const ADMIN_ERRORS = new Set(['credentials', 'not-visible'])

/** Which Jira notices apply; admin-only errors read as unreachable to others. */
function noticeFlags(jira, canAdminister) {
  const error = typeof jira?.error === 'string' ? jira.error : null
  const adminError = ADMIN_ERRORS.has(error)
  return {
    pending: jira?.pending === true,
    credentials: canAdminister && error === 'credentials',
    notVisible: canAdminister && error === 'not-visible',
    unreachable:
      jira?.stale === true ||
      error === 'unavailable' ||
      (adminError && !canAdminister)
  }
}

function unreachableText(refreshedAt) {
  const at = Date.parse(refreshedAt)
  return Number.isFinite(at)
    ? `Jira could not be reached; showing the last data stored, from ${formatDateTime(at)} UTC.`
    : 'Jira could not be reached; showing the last data stored.'
}

/**
 * What the backend says about the Jira refresh behind the metrics. Additive:
 * the metrics always render, and an older backend sends no `jira` at all.
 */
export function JiraNotices({ metrics, canAdminister = false }) {
  const jira = metrics?.jira
  const flags = noticeFlags(jira, canAdminister)

  return (
    <>
      {flags.pending && (
        <NotificationBanner title="Refreshing Jira Data" headingLevel={3}>
          Jira data is being refreshed. This page updates when it is ready.
        </NotificationBanner>
      )}
      {flags.credentials && (
        <NotificationBanner title="Jira Credentials Rejected" headingLevel={3}>
          Jira rejected the credentials this dashboard uses, so Jira data cannot
          be refreshed. Check the Jira credentials for this service.
        </NotificationBanner>
      )}
      {flags.notVisible && (
        <NotificationBanner title="Jira Project Not Visible" headingLevel={3}>
          The Jira account this dashboard uses cannot see this project&rsquo;s
          Jira project, so Jira data cannot be refreshed. Give that account
          access to the project in Jira.
        </NotificationBanner>
      )}
      {flags.unreachable && (
        <NotificationBanner title="Jira Not Reached" headingLevel={3}>
          {unreachableText(jira?.refreshedAt)}
        </NotificationBanner>
      )}
      {metrics?.sonar?.stale === true && (
        <p className="govuk-body-s app-muted">
          Some quality gates are not yet available.
        </p>
      )}
    </>
  )
}
