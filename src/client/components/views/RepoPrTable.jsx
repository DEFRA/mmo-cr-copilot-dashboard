import { SortableTable, Tag } from '../govuk'
import { formatDuration } from '../../lib/selectors'
import { Meter, OpenButton, PR_COLUMN } from './scope.jsx'

export const prName = (row) =>
  row.title ? `#${row.prNumber} ${row.title}` : `#${row.prNumber}`

function PrStatusTag({ merged }) {
  return (
    <Tag colour={merged ? 'green' : 'blue'}>{merged ? 'Merged' : 'Open'}</Tag>
  )
}

function JiraKeys({ keys }) {
  if (keys.length === 0) {
    return <span className="app-badge app-badge--excluded">No Jira key</span>
  }
  return keys.map((key) => (
    <span key={key} className="app-badge app-badge--ticket">
      {key}
    </span>
  ))
}

const JIRA_COLUMN = { id: 'jira', label: 'Jira', sortable: false }

function prCells(r, jiraConnected, onOpen) {
  return [
    {
      content: (
        <OpenButton onClick={onOpen(r.prNumber)}>{prName(r)}</OpenButton>
      ),
      sortValue: r.prNumber
    },
    r.contributors.join(', '),
    {
      content: <PrStatusTag merged={r.merged} />,
      sortValue: r.merged ? 'Merged' : 'Open'
    },
    {
      content: (
        <span className="app-family--assist">
          <Meter value={r.copilotAssistedRate} />
          {r.copilotAssistedRate}%
        </span>
      ),
      sortValue: r.copilotAssistedRate
    },
    { content: formatDuration(r.cycleHours), sortValue: r.cycleHours },
    ...(jiraConnected ? [<JiraKeys key="jira" keys={r.jiraKeys} />] : [])
  ]
}

/** A repository's pull requests, newest first, each opening its commits. */
export function RepoPrTable({ prs, name, jiraConnected, onOpen }) {
  return (
    <SortableTable
      className="govuk-!-margin-bottom-0"
      caption={`Pull requests in ${name} for the selected period, newest first`}
      captionHidden
      head={[
        PR_COLUMN,
        { id: 'who', label: 'Contributors' },
        { id: 'status', label: 'Status' },
        { id: 'assist', label: 'Commit assist rate' },
        { id: 'cycle', label: 'PR coding cycle time', numeric: true },
        ...(jiraConnected ? [JIRA_COLUMN] : [])
      ]}
      rows={prs.map((r) => ({
        id: r.prNumber,
        cells: prCells(r, jiraConnected, onOpen)
      }))}
    />
  )
}
