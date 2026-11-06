import { useId, useMemo } from 'react'

import { ChartFigure, PanelState } from '../dashboard'
import { InsetText } from '../govuk'
import { CategoryBar } from '../charts/CategoryBar'
import { StackedBar } from '../charts/StackedBar'
import { COMPLEXITY_BANDS, selectLeverageBands } from '../../lib/selectors'
import { METRICS_DOC, PERIOD_CHIP, ScopeHeader } from './scope.jsx'

const NOT_ENOUGH = 'Not enough comparable pull requests'

/** How Copilot Leverage v2 is calculated, with this project's band data (ADR 0004). */
export function LeverageView({ leverage }) {
  const headingId = useId()
  const { data, status } = leverage
  const bands = useMemo(() => selectLeverageBands(data), [data])
  const comparable = bands.filter((b) => b.comparable)
  const adoptionDate = data?.adoptionStartDate
    ? new Date(data.adoptionStartDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : null

  return (
    <section className="app-scope" aria-labelledby={headingId}>
      <ScopeHeader
        id={headingId}
        level="Method"
        icon="rocket"
        title="How Copilot Leverage is calculated"
        meta="Like-for-like comparison by pull request complexity"
      />
      <>
        <p className="govuk-body">
          Every pull request gets a complexity score from 1 to 100, from the
          lines it changes, the files it touches and the modules it spans.
          Generated files, lockfiles and tests are left out. Scores fall into
          five bands, XS to XL.
        </p>
        <p className="govuk-body">
          Pull requests merged before the project adopted Copilot form the
          baseline. Within each band, the median coding cycle time of baseline
          pull requests is compared with that of pull requests in the selected
          period. Comparing within a band stops a run of small pull requests
          from looking like a productivity gain.
        </p>
        <p className="govuk-body">
          A band is compared only when it has at least 5 pull requests on each
          side. Leverage is the average speed-up across the bands that qualify.{' '}
          <a className="govuk-link" href={`${METRICS_DOC}#metric-leverage-v2`}>
            Metric definition
            <span className="govuk-visually-hidden">: Copilot Leverage v2</span>
          </a>
        </p>
      </>

      {status === 'error' && (
        <PanelState
          state="error"
          icon="rocket"
          errorMessage="We could not load Copilot Leverage. Try again later."
        />
      )}
      {status !== 'error' && status !== 'success' && (
        <PanelState state="loading" icon="rocket" />
      )}
      {status === 'success' && (
        <>
          <InsetText>
            {comparable.length > 0
              ? `Copilot Leverage: ${data.overallLeverageScore}× faster across ${comparable.length} comparable ${comparable.length === 1 ? 'band' : 'bands'}.`
              : `${NOT_ENOUGH} yet.`}{' '}
            {adoptionDate &&
              `Baseline: pull requests merged before ${adoptionDate}.`}
          </InsetText>

          <div className="app-grid">
            <ChartFigure
              number={1}
              title="Pull requests by complexity band"
              subtitle="Number of pull requests in each complexity band, selected period."
              family="leverage"
              icon="bars"
              chip={PERIOD_CHIP}
              className="app-span-6"
              columns={[
                { id: 'band', label: 'Band' },
                { id: 'prs', label: 'Pull requests', numeric: true }
              ]}
              rows={bands.map((b) => [b.band, b.adoptedCount])}
            >
              <CategoryBar
                title="Pull requests by complexity band"
                categories={COMPLEXITY_BANDS}
                values={bands.map((b) => b.adoptedCount)}
                seriesName="Pull requests"
                height={260}
              />
            </ChartFigure>
            <ChartFigure
              number={2}
              title="Median coding cycle time by band"
              subtitle="Median PR coding cycle time in hours, baseline against the selected period, per complexity band."
              family="leverage"
              icon="clock"
              chip={PERIOD_CHIP}
              className="app-span-6"
              columns={[
                { id: 'band', label: 'Band' },
                { id: 'base', label: 'Baseline (hours)', numeric: true },
                { id: 'now', label: 'Selected period (hours)', numeric: true },
                { id: 'n', label: 'Pull requests (baseline / period)' },
                { id: 'result', label: 'Comparison' }
              ]}
              rows={bands.map((b) => [
                b.band,
                b.baselineHours,
                b.adoptedHours,
                `${b.baselineCount} / ${b.adoptedCount}`,
                b.comparable ? `${b.speedup}× faster` : NOT_ENOUGH
              ])}
            >
              <StackedBar
                grouped
                title="Median coding cycle time by band"
                categories={COMPLEXITY_BANDS}
                unit="h"
                height={260}
                series={[
                  {
                    name: 'Baseline',
                    data: bands.map((b) => b.baselineHours),
                    colorToken: 'manual'
                  },
                  {
                    name: 'Selected period',
                    data: bands.map((b) => b.adoptedHours),
                    colorToken: 'copilot'
                  }
                ]}
              />
            </ChartFigure>
          </div>

          <ul className="govuk-list govuk-list--bullet">
            {bands.map((b) => (
              <li key={b.band}>
                <strong>{b.band}:</strong>{' '}
                {b.comparable
                  ? `${b.speedup}× faster (${b.baselineCount} baseline, ${b.adoptedCount} in the period)`
                  : `${NOT_ENOUGH} (${b.baselineCount} baseline, ${b.adoptedCount} in the period; 5 needed on each side)`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
