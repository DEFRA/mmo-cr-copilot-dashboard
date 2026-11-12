import { Panel, PanelState } from '../dashboard'
import { cx } from '../govuk/utils.js'
import { formatDuration } from '../../lib/selectors'
import { plural } from './scope.jsx'

function LeverageCard({ title, children, footnote }) {
  return (
    <Panel title={title} family="leverage" icon="rocket" headingLevel={4}>
      {children}
      {footnote && <p className="govuk-body-s app-muted">{footnote}</p>}
    </Panel>
  )
}

function Figure({ label, value }) {
  return (
    <p className="govuk-body govuk-!-margin-bottom-2">
      <span className="app-muted">{label}</span>{' '}
      <strong className="govuk-!-font-size-24">{value}</strong>
    </p>
  )
}

const pctOrDash = (n) => (n === null || n === undefined ? '–' : `${n}%`)

function OwnBaselineCard({ ownBaseline }) {
  const footnote = `Baseline: the project's first ${plural(ownBaseline.baselineSprintCount, 'sprint')}.`
  if (!ownBaseline.comparable) {
    return (
      <LeverageCard title="Own-Baseline Trend" footnote={footnote}>
        <p className="govuk-body-s">
          {`Not enough comparable pull requests (${ownBaseline.baselineCount} baseline, ${ownBaseline.currentCount} now; 5 needed on each side).`}
        </p>
      </LeverageCard>
    )
  }
  const now = formatDuration(ownBaseline.currentMedianCycleHours)
  const before = formatDuration(ownBaseline.baselineMedianCycleHours)
  return (
    <LeverageCard title="Own-Baseline Trend" footnote={footnote}>
      <Figure
        label="PR coding cycle time"
        value={`${ownBaseline.speedup}× faster`}
      />
      <p className="govuk-body-s">
        {`Median ${now} now against ${before} at baseline.`}
      </p>
    </LeverageCard>
  )
}

function QualityCard({ quality }) {
  return (
    <LeverageCard
      title="Delivery Quality"
      footnote="Read together, not summed."
    >
      <Figure
        label="Change fail rate"
        value={pctOrDash(quality.changeFailRate)}
      />
      <Figure
        label="Delivery rework rate"
        value={pctOrDash(quality.deliveryReworkRate)}
      />
      <Figure
        label="Ticket reopen rate"
        value={pctOrDash(quality.reopenRate)}
      />
    </LeverageCard>
  )
}

function DurabilityCard({ durability }) {
  if (!durability?.available) {
    return (
      <LeverageCard title="AI Code Durability">
        <PanelState
          state="empty"
          icon="clock"
          emptyTag="Not available yet"
          emptyMessage="Appears once merged pull requests are 21 days old and the survival workflow has measured them."
        />
      </LeverageCard>
    )
  }
  return (
    <LeverageCard
      title="AI Code Durability"
      footnote={`Lines still present ${durability.windowDays} days after merge, across ${plural(durability.prCount, 'pull request')}.`}
    >
      <Figure
        label="AI lines surviving"
        value={pctOrDash(durability.aiSurvivalPercent)}
      />
      <Figure
        label="Human lines surviving"
        value={pctOrDash(durability.humanSurvivalPercent)}
      />
    </LeverageCard>
  )
}

/** AI-Native Delivery Leverage: its components side by side, never summed. */
export function NativeLeverage({ leverage, jiraConnected }) {
  const native = leverage.data
  if (leverage.status === 'error') {
    return (
      <PanelState
        state="error"
        icon="rocket"
        errorMessage="We could not load AI-Native Delivery Leverage. Try again later."
      />
    )
  }
  if (!native) {
    return <PanelState state="loading" icon="rocket" />
  }
  return (
    <div className={cx('app-kpi-grid', !jiraConnected && 'app-kpi-grid--3')}>
      <OwnBaselineCard ownBaseline={native.ownBaseline} />
      <LeverageCard
        title="Complexity-Weighted Throughput"
        footnote="Sum of complexity scores of merged pull requests."
      >
        <Figure label="Score" value={native.complexityWeightedThroughput} />
        <p className="govuk-body-s">
          {`From ${plural(native.mergedPullRequests, 'merged pull request')}.`}
        </p>
      </LeverageCard>
      {jiraConnected && <QualityCard quality={native.deliveryQuality} />}
      <DurabilityCard durability={native.codeDurability} />
    </div>
  )
}
