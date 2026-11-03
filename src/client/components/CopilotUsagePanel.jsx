import { Panel, PanelState } from './dashboard'
import { Table } from './govuk'

const tokens = (n) => n.toLocaleString('en-GB')

/**
 * Copilot model and token usage for a pull request or a project. Counts come
 * from Copilot Chat's local usage log on developers' machines, so the caveat
 * and the coverage figure are always shown beside the numbers.
 */
export function CopilotUsagePanel({ usage, headingLevel = 4, insightsHref }) {
  const title = 'Copilot Model Usage'
  const hasUsage = usage.models.length > 0

  return (
    <Panel
      title={title}
      family="leverage"
      icon="sparkle"
      headingLevel={headingLevel}
      className="app-compare"
    >
      {hasUsage ? (
        <>
          {usage.medianTokensPerPr !== null && (
            <p className="govuk-body-s govuk-!-margin-bottom-2">
              <span className="app-muted">
                Tokens per pull request with usage (median)
              </span>{' '}
              <strong>{tokens(usage.medianTokensPerPr)}</strong>
            </p>
          )}
          <Table
            caption="Copilot model usage by model"
            captionHidden
            head={[
              { id: 'model', label: 'Model' },
              { id: 'requests', label: 'Requests', numeric: true },
              { id: 'input', label: 'Input tokens', numeric: true },
              { id: 'output', label: 'Output tokens', numeric: true },
              { id: 'cached', label: 'Cached tokens', numeric: true }
            ]}
            rows={usage.models.map((m) => ({
              id: m.model,
              cells: [
                m.model,
                tokens(m.requests),
                tokens(m.inputTokens),
                tokens(m.outputTokens),
                tokens(m.cachedTokens)
              ]
            }))}
          />
        </>
      ) : (
        <PanelState
          state="empty"
          icon="sparkle"
          emptyTag="No usage recorded"
          emptyMessage="Usage appears when developers turn on the Copilot usage log in the attribution extension."
        />
      )}
      <p className="govuk-body-s app-muted">
        Token counts come from Copilot Chat&apos;s local usage log on
        developers&apos; machines, for agent and chat sessions only. Inline
        completions do not report tokens.
        {usage.assistedPrs > 0 && (
          <>
            {' '}
            Coverage: {usage.prsWithUsage} of {usage.assistedPrs} pull requests
            with Copilot-written lines.
          </>
        )}
      </p>
      {hasUsage && insightsHref && (
        <p className="govuk-body-s govuk-!-margin-bottom-0">
          <a className="govuk-link" href={insightsHref}>
            See Copilot usage insights
            <span className="govuk-visually-hidden">
              : favourite model, leaderboard and superlatives
            </span>
          </a>
        </p>
      )}
    </Panel>
  )
}
