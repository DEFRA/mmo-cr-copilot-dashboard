import { Panel } from './dashboard'
import { SortableTable } from './govuk'
import { formatCredits, Meter } from './views/scope.jsx'

const HEAD = [
  { id: 'model', label: 'Model' },
  { id: 'requests', label: 'Requests', numeric: true },
  { id: 'share', label: 'Share of requests', numeric: true },
  { id: 'credits', label: 'AI credits', numeric: true },
  { id: 'perRequest', label: 'Credits per request', numeric: true },
  { id: 'creditShare', label: 'Share of credits', numeric: true },
  { id: 'prs', label: 'Pull requests', numeric: true }
]

const number = (value) => value.toLocaleString('en-GB')

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
      { content: formatCredits(m.credits), sortValue: m.credits ?? -1 },
      {
        content:
          m.creditsPerRequest === null
            ? '–'
            : formatCredits(m.creditsPerRequest),
        sortValue: m.creditsPerRequest ?? -1
      },
      {
        content: m.creditShare === null ? '–' : `${m.creditShare}%`,
        sortValue: m.creditShare ?? -1
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
      {/* Focusable so keyboard users can scroll the table on narrow screens (WCAG 2.1.1). */}
      <section
        className="app-table-scroll"
        aria-label="Copilot model leaderboard"
        tabIndex={0} // NOSONAR: a scrollable region must take focus (axe scrollable-region-focusable)
      >
        <SortableTable
          className="govuk-!-margin-bottom-0"
          caption="Copilot model leaderboard"
          captionHidden
          head={HEAD}
          rows={models.map((m) => toRow(m, favourite))}
          initialSort={{ id: 'requests', direction: 'descending' }}
        />
      </section>
      {models.some((m) => m.model === 'other') && (
        <p className="govuk-body-s app-muted govuk-!-margin-top-3 govuk-!-margin-bottom-0">
          ‘other’ combines models beyond the 20-model limit per pull request.
        </p>
      )}
    </Panel>
  )
}
