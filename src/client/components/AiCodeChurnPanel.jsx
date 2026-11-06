import { ChartFigure, Panel, PanelState } from './dashboard'
import { Tag } from './govuk'
import { CategoryBar } from './charts/CategoryBar'
import { selectAiCodeChurnRate } from '../lib/selectors'

const percent = (value) => (value === null ? '–' : `${value}%`)

/**
 * AI code churn: the share of AI-written lines rewritten or deleted within the
 * window after merge (docs/metrics.md, CCR). Above 25% the delivered volume is
 * discounted, which the tag states. Backed by the survival workflow.
 */
export function AiCodeChurnPanel({ churn, status, number }) {
  const rate = selectAiCodeChurnRate(churn)
  const title = `AI Code Churn (${rate.windowDays} Days)`

  if (status === 'error') {
    return (
      <Panel title={title} family="leverage" icon="clock" headingLevel={4}>
        <PanelState
          state="error"
          icon="clock"
          errorMessage="We could not load AI code churn. Try again later."
        />
      </Panel>
    )
  }
  if (!churn) {
    return (
      <Panel title={title} family="leverage" icon="clock" headingLevel={4}>
        <PanelState state="loading" title={title} icon="clock" />
      </Panel>
    )
  }
  if (!rate.available) {
    return (
      <Panel title={title} family="leverage" icon="clock" headingLevel={4}>
        <PanelState
          state="empty"
          icon="clock"
          emptyTag="Not available yet"
          emptyMessage={
            rate.reason ??
            `No AI lines merged in this period have reached ${rate.windowDays} days yet.`
          }
        />
      </Panel>
    )
  }

  const rows = rate.byOrigin.map((origin) => [
    origin.label,
    origin.merged,
    origin.surviving,
    origin.churnPercent === null ? '–' : `${origin.churnPercent}%`
  ])

  return (
    <>
      <Panel
        title={title}
        family="leverage"
        icon="clock"
        headingLevel={4}
        aside={
          rate.penaltyApplied ? <Tag colour="red">Penalty Applied</Tag> : null
        }
      >
        <p className="govuk-body govuk-!-margin-bottom-2">
          <span className="app-muted">AI lines rewritten or deleted</span>{' '}
          <strong className="govuk-!-font-size-24">
            {percent(rate.percent)}
          </strong>
        </p>
        <p className="govuk-body-s">
          Human lines in the same pull requests: {percent(rate.humanPercent)}.
          Measured on {rate.prCount}{' '}
          {rate.prCount === 1 ? 'pull request' : 'pull requests'},{' '}
          {rate.aiLinesMerged.toLocaleString('en-GB')} AI lines merged.
        </p>
        {rate.penaltyApplied && (
          <p className="govuk-body-s app-muted">
            Above 25%, delivered volume is multiplied by {rate.multiplier}.
          </p>
        )}
      </Panel>
      <div className="govuk-!-margin-top-5">
        <ChartFigure
          number={number}
          title="Churn By AI Origin"
          subtitle={`Share of AI lines from each source that did not survive ${rate.windowDays} days`}
          family="leverage"
          icon="clock"
          columns={[
            { id: 'origin', label: 'Origin' },
            { id: 'merged', label: 'AI lines merged', numeric: true },
            { id: 'surviving', label: 'Still present', numeric: true },
            { id: 'churn', label: 'Churn', numeric: true }
          ]}
          rows={rows}
        >
          <CategoryBar
            title="Churn by AI origin"
            categories={rate.byOrigin.map((origin) => origin.label)}
            values={rate.byOrigin.map((origin) => origin.churnPercent ?? 0)}
            seriesName="Churn"
            unit="%"
            height={220}
          />
        </ChartFigure>
      </div>
    </>
  )
}
