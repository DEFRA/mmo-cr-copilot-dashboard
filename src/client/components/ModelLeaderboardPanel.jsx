import { Panel } from './dashboard'
import { SortableTable, Tag } from './govuk'
import { Meter } from './views/scope.jsx'

const HEAD = [
  { id: 'model', label: 'Model' },
  { id: 'requests', label: 'Requests', numeric: true },
  { id: 'share', label: 'Share of requests', numeric: true },
  { id: 'tokens', label: 'Total tokens', numeric: true },
  { id: 'perRequest', label: 'Tokens per request', numeric: true },
  { id: 'cache', label: 'Cache hit rate', numeric: true },
  { id: 'prs', label: 'Pull requests', numeric: true }
]

const number = (value) => value.toLocaleString('en-GB')

function CacheRating({ rate }) {
  if (rate === null) return <Tag colour="grey">Not reported</Tag>
  if (rate >= 60) return <Tag colour="green">High</Tag>
  if (rate >= 30) return <Tag colour="yellow">Medium</Tag>
  return <Tag colour="grey">Low</Tag>
}

// The crown is the visual cue; the hidden text carries the meaning for assistive technology.
function FavouriteCrown() {
  return (
    <span className="app-crown" title="Team favourite">
      <svg
        aria-hidden="true"
        focusable="false"
        width="20"
        height="20"
        viewBox="0 0 24 24"
      >
        <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
        <circle cx="3" cy="7" r="1.6" />
        <circle cx="12" cy="4" r="1.6" />
        <circle cx="21" cy="7" r="1.6" />
      </svg>
      <span className="govuk-visually-hidden">Team favourite</span>
    </span>
  )
}

function toRow(m, favourite) {
  return {
    id: m.model,
    cells: [
      {
        content: (
          <span className="app-leaderboard__model">
            {m.model}
            {m.model === favourite && <FavouriteCrown />}
          </span>
        ),
        sortValue: m.model
      },
      { content: number(m.requests), sortValue: m.requests },
      {
        content: (
          <span className="app-leaderboard__stack app-family--leverage">
            <span>{m.requestShare}%</span>
            <Meter value={m.requestShare} />
          </span>
        ),
        sortValue: m.requestShare
      },
      { content: number(m.totalTokens), sortValue: m.totalTokens },
      {
        content: m.tokensPerRequest === null ? '–' : number(m.tokensPerRequest),
        sortValue: m.tokensPerRequest ?? -1
      },
      {
        content: (
          <span className="app-leaderboard__stack">
            {m.cacheHitRate !== null && <span>{m.cacheHitRate}%</span>}
            <CacheRating rate={m.cacheHitRate} />
          </span>
        ),
        sortValue: m.cacheHitRate ?? -1
      },
      { content: number(m.prCount), sortValue: m.prCount }
    ]
  }
}

export function ModelLeaderboardPanel({
  models = [],
  favourite = null,
  headingLevel = 4,
  title = 'Model Leaderboard'
}) {
  return (
    <Panel
      title={title}
      family="leverage"
      icon="bars"
      headingLevel={headingLevel}
      className="app-compare app-leaderboard"
    >
      {/* Focusable so keyboard users can scroll the table on narrow screens. */}
      <div
        className="app-table-scroll"
        role="region"
        aria-label="Copilot model leaderboard"
        tabIndex={0}
      >
        <SortableTable
          className="govuk-!-margin-bottom-0"
          caption="Copilot model leaderboard"
          captionHidden
          head={HEAD}
          rows={models.map((m) => toRow(m, favourite))}
          initialSort={{ id: 'requests', direction: 'descending' }}
        />
      </div>
      {models.some((m) => m.model === 'other') && (
        <p className="govuk-body-s app-muted govuk-!-margin-top-3 govuk-!-margin-bottom-0">
          ‘other’ combines models beyond the 20-model limit per pull request.
        </p>
      )}
    </Panel>
  )
}
