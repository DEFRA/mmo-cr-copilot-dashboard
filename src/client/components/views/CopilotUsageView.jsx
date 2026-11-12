import { useId, useMemo } from 'react'

import { ChartFigure, KpiCard, Panel, PanelState } from '../dashboard'
import { CategoryBar } from '../charts/CategoryBar'
import { CopilotSuperlatives } from '../CopilotSuperlatives.jsx'
import { ModelLeaderboardPanel } from '../ModelLeaderboardPanel.jsx'
import { foldModels, round, selectCopilotInsights } from '../../lib/selectors'
import {
  formatCredits,
  lines,
  plural,
  pullRequests,
  ScopeHeader,
  Subsection
} from './scope.jsx'

function Caveat({ insights }) {
  return (
    <p className="govuk-body-s app-muted govuk-!-margin-top-5">
      Requests are model calls made by Copilot Chat agent and chat sessions, not
      prompts typed. AI credits are GitHub&apos;s list-price credits recorded by
      the attribution extension for developers who opted in; inline completions
      use none, and pull requests from before credits were recorded show them as
      not recorded. Shown per team and model only, never per person. Coverage:{' '}
      {insights.coverage.prsWithUsage} of {insights.coverage.assistedPrs} pull
      requests with Copilot-written lines have usage,{' '}
      {insights.coverage.prsWithCredits} with credits.{' '}
      <a className="govuk-link" href="#metric-copilot-usage-insights">
        {'Metric definition'}
        <span className="govuk-visually-hidden">: Copilot usage insights</span>
      </a>
    </p>
  )
}

/** Team and model level Copilot usage: requests and recorded AI credits. */
export function CopilotUsageView({ payloads }) {
  const headingId = useId()
  const insights = useMemo(() => selectCopilotInsights(payloads), [payloads])
  const requestsData = useMemo(
    () => foldModels(insights.models, 8, 'requests'),
    [insights.models]
  )
  const creditsData = useMemo(
    () =>
      foldModels(
        insights.models.filter((m) => m.credits !== null),
        8,
        'credits'
      ),
    [insights.models]
  )

  const header = (
    <ScopeHeader
      id={headingId}
      level="Copilot usage"
      icon="sparkle"
      title="Model Usage and AI Credits"
      meta={`${pullRequests(insights.coverage.prsWithUsage)} with usage`}
    />
  )

  if (!insights.hasUsage) {
    return (
      <section className="app-scope" aria-labelledby={headingId}>
        {header}
        <Panel title="Copilot Usage" family="leverage" icon="sparkle">
          <PanelState
            state="empty"
            icon="sparkle"
            emptyTag="No usage recorded"
            emptyMessage="Usage appears when developers turn on the Copilot usage log in the attribution extension."
          />
        </Panel>
        <Caveat insights={insights} />
      </section>
    )
  }

  const { totals, favourite, variety } = insights
  const { prsWithCredits } = insights.coverage

  return (
    <section className="app-scope" aria-labelledby={headingId}>
      {header}

      <div className="app-kpi-grid">
        <KpiCard
          label="Team Favourite Model"
          value={favourite?.model ?? '–'}
          compact
          badge="Most requests"
          sub={`${favourite?.requestShare ?? 0}% of model requests · ${pullRequests(favourite?.prCount ?? 0)}`}
          family="adoption"
          showFamily={false}
          icon="sparkle"
          index={0}
        />
        <KpiCard
          label="Model Requests"
          value={lines(totals.requests)}
          sub={`Across ${plural(variety.distinctModels, 'model')}`}
          family="output"
          showFamily={false}
          icon="bars"
          index={1}
        />
        <KpiCard
          label="AI Credits Used"
          value={totals.credits === null ? '–' : formatCredits(totals.credits)}
          sub={
            totals.credits === null
              ? 'Not recorded'
              : `${formatCredits(totals.creditsPerRequest)} per request · ${pullRequests(prsWithCredits)} with credits`
          }
          family="risk"
          showFamily={false}
          icon="layers"
          index={2}
        />
        <KpiCard
          label="AI Credits per Pull Request"
          value={
            insights.medianCreditsPerPr === null
              ? '–'
              : formatCredits(insights.medianCreditsPerPr)
          }
          sub={
            insights.medianCreditsPerPr === null
              ? 'Not recorded'
              : `Median across ${pullRequests(prsWithCredits)}`
          }
          family="quality"
          showFamily={false}
          icon="gauge"
          index={3}
        />
      </div>

      <Subsection
        title="Team Superlatives"
        family="leverage"
        icon="target"
        meta="Models used in at least 2 pull requests"
      >
        <CopilotSuperlatives superlatives={insights.superlatives} />
      </Subsection>

      <Subsection title="Model Leaderboard" family="leverage" icon="bars">
        <div className="app-grid">
          <ChartFigure
            number={1}
            title="Requests by Model"
            subtitle="Model calls by model, selected period. A request is one call to the model, not one prompt."
            family="leverage"
            icon="bars"
            headingLevel={4}
            className="app-span-6"
            columns={[
              { id: 'model', label: 'Model' },
              { id: 'requests', label: 'Requests', numeric: true },
              { id: 'share', label: 'Share of requests (%)', numeric: true }
            ]}
            rows={requestsData.map((m) => [
              m.model,
              m.requests,
              totals.requests > 0
                ? round((m.requests / totals.requests) * 100, 1)
                : 0
            ])}
          >
            <CategoryBar
              horizontal
              title="Requests by model"
              categories={requestsData.map((m) => m.model)}
              values={requestsData.map((m) => m.requests)}
              seriesName="Requests"
            />
          </ChartFigure>
          {creditsData.length > 0 ? (
            <ChartFigure
              number={2}
              title="AI Credits by Model"
              subtitle="GitHub AI credits recorded for each model, selected period."
              family="leverage"
              icon="layers"
              headingLevel={4}
              className="app-span-6"
              columns={[
                { id: 'model', label: 'Model' },
                { id: 'credits', label: 'AI credits', numeric: true },
                { id: 'share', label: 'Share of credits (%)', numeric: true }
              ]}
              rows={creditsData.map((m) => [
                m.model,
                round(m.credits, 2),
                totals.credits > 0
                  ? round((m.credits / totals.credits) * 100, 1)
                  : 0
              ])}
            >
              <CategoryBar
                horizontal
                title="AI credits by model"
                categories={creditsData.map((m) => m.model)}
                values={creditsData.map((m) => round(m.credits, 2))}
                seriesName="AI credits"
              />
            </ChartFigure>
          ) : (
            <Panel
              title="AI Credits by Model"
              family="leverage"
              icon="layers"
              headingLevel={4}
              className="app-span-6"
            >
              <PanelState
                state="empty"
                icon="layers"
                emptyTag="No AI credits recorded"
                emptyMessage="Credits appear for pull requests whose commits were made with attribution extension 0.5.0 or later and usage capture turned on."
              />
            </Panel>
          )}
        </div>
        <div className="govuk-!-margin-top-5">
          <ModelLeaderboardPanel
            title="Usage by Model"
            models={insights.models}
            favourite={insights.favourite?.model}
          />
        </div>
      </Subsection>

      <Caveat insights={insights} />
    </section>
  )
}
