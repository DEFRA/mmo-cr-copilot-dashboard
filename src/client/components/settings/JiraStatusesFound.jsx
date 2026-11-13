import { Panel, PanelState } from '../dashboard'
import { Button, InsetText, NotificationBanner, Table, Tag } from '../govuk'
import { stageOf, stageTitle } from '../../lib/jira-workflow'

const CATEGORY_LABEL = {
  new: 'To Do',
  indeterminate: 'In Progress',
  done: 'Done'
}

function foundState(found) {
  if (found.statuses.length > 0) {
    return 'populated'
  }
  if (found.status === 'error') {
    return 'error'
  }
  return found.status === 'success' ? 'empty' : 'loading'
}

const statusRows = (found, stages) =>
  found.statuses.map((s) => {
    const stage = stageOf(stages, s.name)
    return {
      id: s.name,
      cells: [
        s.name,
        CATEGORY_LABEL[s.categoryKey] ?? 'Unknown',
        stage ? (
          stageTitle(stage)
        ) : (
          <Tag key="stage" colour="grey">
            Not mapped
          </Tag>
        ),
        s.issueCount
      ]
    }
  })

/** The project's Jira statuses and the stage each one sits in. */
export function StatusesFound({ found, stages }) {
  const loading = found.status === 'loading'
  return (
    <Panel
      title="Statuses Found in This Project"
      family="speed"
      icon="ticket"
      headingLevel={2}
      busy={loading}
    >
      <p className="govuk-body">
        The statuses your Jira project uses and those on tickets linked to pull
        requests, with the stage each one is in.
      </p>
      {found.status === 'success' && !found.jiraAvailable && (
        <InsetText>
          We could not reach Jira, so this list only shows statuses on tickets
          already linked to pull requests.
        </InsetText>
      )}
      {found.status === 'error' && found.statuses.length > 0 && (
        <NotificationBanner headingLevel={3}>
          We could not refresh the statuses. Showing the last list loaded.
        </NotificationBanner>
      )}
      <PanelState
        state={foundState(found)}
        title="Jira statuses"
        icon="ticket"
        emptyTag="No statuses found"
        emptyMessage="Statuses appear here when Jira can be reached or a pull request links to a Jira ticket."
        errorMessage="We could not load the Jira statuses. Try again later."
      >
        <Table
          caption="Jira Statuses and Their Stages"
          captionSize="s"
          head={[
            { id: 'status', label: 'Status' },
            { id: 'category', label: 'Jira category' },
            { id: 'stage', label: 'Stage' },
            { id: 'tickets', label: 'Tickets now', numeric: true }
          ]}
          rows={statusRows(found, stages)}
        />
      </PanelState>
      <Button
        variant="secondary"
        className="govuk-!-margin-bottom-0"
        disabled={loading}
        onClick={() => found.refresh()}
      >
        {loading ? 'Checking…' : 'Check Jira statuses again'}
      </Button>
    </Panel>
  )
}
