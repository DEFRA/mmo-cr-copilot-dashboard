import { useMemo } from 'react'

import { selectModelRequestShares } from '../lib/selectors'
import { ModelSharePie } from './charts/ModelSharePie'
import { Panel, PanelState } from './dashboard'
import { Table } from './govuk'
import { formatCredits, lines } from './views/scope.jsx'

/**
 * Copilot model requests and GitHub AI credits for a pull request or a project.
 * Credits are recorded on developers' machines by the attribution extension, so
 * the caveat and the coverage figures are always shown beside the numbers.
 */
export function CopilotUsagePanel({
  usage,
  headingLevel = 4,
  insightsHref,
  meta
}) {
  const title = 'GitHub Copilot Usage Metrics'
  const hasUsage = usage.models.length > 0
  const shares = useMemo(
    () => selectModelRequestShares(usage.models),
    [usage.models]
  )
  const shareByModel = useMemo(
    () =>
      new Map(
        selectModelRequestShares(usage.models, Infinity).map((s) => [
          s.model,
          s.share
        ])
      ),
    [usage.models]
  )

  return (
    <Panel
      title={title}
      family="leverage"
      icon="sparkle"
      headingLevel={headingLevel}
      aside={meta && <span className="app-muted">{meta}</span>}
      className="app-compare"
    >
      {hasUsage ? (
        <>
          {usage.medianCreditsPerPr !== null && (
            <p className="govuk-body-s govuk-!-margin-bottom-2">
              <span className="app-muted">
                AI credits per pull request with credits (median)
              </span>{' '}
              <strong>{formatCredits(usage.medianCreditsPerPr)}</strong>
            </p>
          )}
          <div className={shares.length > 0 ? 'app-usage-split' : undefined}>
            <Table
              caption="Requests and AI credits by model"
              captionHidden
              head={[
                { id: 'model', label: 'Model' },
                { id: 'requests', label: 'Requests', numeric: true },
                {
                  id: 'share',
                  label: 'Share of requests',
                  numeric: true
                },
                { id: 'credits', label: 'AI credits', numeric: true }
              ]}
              rows={usage.models.map((m) => ({
                id: m.model,
                cells: [
                  m.model,
                  lines(m.requests),
                  shareByModel.has(m.model)
                    ? `${shareByModel.get(m.model)}%`
                    : '—',
                  formatCredits(m.credits)
                ]
              }))}
            />
            {shares.length > 0 && (
              <div>
                <p className="govuk-body-s app-muted govuk-!-margin-bottom-1">
                  Share of Requests by Model
                </p>
                <ModelSharePie shares={shares} />
              </div>
            )}
          </div>
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
        AI credits are GitHub&apos;s list-price credits recorded by the
        attribution extension for agent and chat sessions; inline completions
        use none. Pull requests from before credits were recorded show them as
        not recorded.
        {usage.assistedPrs > 0 && (
          <>
            {' '}
            Coverage: {usage.prsWithUsage} of {usage.assistedPrs} pull requests
            with Copilot-written lines have usage, {usage.prsWithCredits} with
            credits.
          </>
        )}
      </p>
      {hasUsage && insightsHref && (
        <p className="govuk-body-s govuk-!-margin-bottom-0">
          <a className="govuk-link" href={insightsHref}>
            {'See Copilot usage insights'}
            <span className="govuk-visually-hidden">
              : favourite model, leaderboard and superlatives
            </span>
          </a>
        </p>
      )}
    </Panel>
  )
}
