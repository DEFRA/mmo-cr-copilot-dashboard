import { useId, useMemo } from 'react'

import {
  ChartFigure,
  KpiCard,
  Panel,
  PanelState,
  ProgressRing
} from '../dashboard'
import { CategoryBar } from '../charts/CategoryBar'
import { StackedBar } from '../charts/StackedBar'
import { CopilotSuperlatives } from '../CopilotSuperlatives.jsx'
import { ModelLeaderboardPanel } from '../ModelLeaderboardPanel.jsx'
import { foldModels, round, selectCopilotInsights } from '../../lib/selectors'
import { lines, plural, ScopeHeader, Subsection } from './scope.jsx'

const sumOf = (rows, key) => rows.reduce((s, m) => s + m[key], 0)

function compactTokens(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return String(value)
}

// foldModels collapses the tail into one entry that only carries the sort key.
function withTokenSplit(folded, all) {
  const kept = new Set(folded.map((m) => m.model))
  const rest = all.filter((m) => !kept.has(m.model))
  return folded.map((m) =>
    m.inputTokens === undefined
      ? {
          ...m,
          inputTokens: sumOf(rest, 'inputTokens'),
          cacheReadTokens: sumOf(rest, 'cacheReadTokens'),
          outputTokens: sumOf(rest, 'outputTokens')
        }
      : m
  )
}

const thousands = (v) => round(v / 1000, 1)

function Caveat({ insights }) {
  return (
    <p className="govuk-body-s app-muted govuk-!-margin-top-5">
      Requests are model calls made by Copilot Chat agent and chat sessions, not
      prompts typed. Token counts come from Copilot Chat&apos;s local usage log
      for developers who opted in. Inline completions do not report tokens.
      Shown per team and model only, never per person. Coverage:{' '}
      {insights.coverage.prsWithUsage} of {insights.coverage.assistedPrs} pull
      requests with Copilot-written lines.{' '}
      <a className="govuk-link" href="#metric-copilot-usage-insights">
        Metric definition
        <span className="govuk-visually-hidden">: Copilot usage insights</span>
      </a>
    </p>
  )
}

/** Team and model level Copilot usage: requests, tokens and cache reuse. */
export function CopilotUsageView({ payloads }) {
  const headingId = useId()
  const insights = useMemo(() => selectCopilotInsights(payloads), [payloads])
  const requestsData = useMemo(
    () => foldModels(insights.models, 8, 'requests'),
    [insights.models]
  )
  const tokensData = useMemo(
    () =>
      withTokenSplit(
        foldModels(insights.models, 6, 'totalTokens'),
        insights.models
      ),
    [insights.models]
  )

  const header = (
    <ScopeHeader
      id={headingId}
      level="Copilot usage"
      icon="sparkle"
      title="Model and Token Usage"
      meta={`${plural(insights.coverage.prsWithUsage, 'pull request')} with usage`}
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
  const cacheRate = totals.cacheHitRate

  return (
    <section className="app-scope" aria-labelledby={headingId}>
      {header}

      <div className="app-kpi-grid">
        <KpiCard
          label="Team Favourite Model"
          value={favourite?.model ?? '–'}
          compact
          badge="Most requests"
          sub={`${favourite?.requestShare ?? 0}% of model requests · ${plural(favourite?.prCount ?? 0, 'pull request')}`}
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
          label="Tokens Used"
          value={compactTokens(totals.totalTokens)}
          sub={`${lines(totals.inputTokens)} input · ${lines(totals.outputTokens)} output`}
          family="risk"
          showFamily={false}
          icon="layers"
          index={2}
        />
        <KpiCard
          label="Cache Hit Rate"
          value={`${cacheRate ?? '–'}`}
          unit={cacheRate === null ? '' : '%'}
          chart={cacheRate === null ? null : <ProgressRing value={cacheRate} />}
          sub={
            cacheRate === null
              ? 'Not reported'
              : `${lines(totals.cacheReadTokens)} of ${lines(totals.inputTokens)} input tokens from cache`
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
          <ChartFigure
            number={2}
            title="Tokens by Model and Type"
            subtitle="Tokens by model in thousands. Cached input is served from prompt cache."
            family="leverage"
            icon="layers"
            headingLevel={4}
            className="app-span-6"
            columns={[
              { id: 'model', label: 'Model' },
              { id: 'uncached', label: 'Uncached input (k)', numeric: true },
              { id: 'cache', label: 'Cache read (k)', numeric: true },
              { id: 'output', label: 'Output (k)', numeric: true }
            ]}
            rows={tokensData.map((m) => [
              m.model,
              thousands(Math.max(0, m.inputTokens - m.cacheReadTokens)),
              thousands(m.cacheReadTokens),
              thousands(m.outputTokens)
            ])}
          >
            <StackedBar
              horizontal
              title="Tokens by model and type"
              categories={tokensData.map((m) => m.model)}
              unit="k"
              series={[
                {
                  name: 'Uncached input',
                  data: tokensData.map((m) =>
                    thousands(Math.max(0, m.inputTokens - m.cacheReadTokens))
                  )
                },
                {
                  name: 'Cache read',
                  data: tokensData.map((m) => thousands(m.cacheReadTokens))
                },
                {
                  name: 'Output',
                  data: tokensData.map((m) => thousands(m.outputTokens))
                }
              ]}
            />
          </ChartFigure>
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
