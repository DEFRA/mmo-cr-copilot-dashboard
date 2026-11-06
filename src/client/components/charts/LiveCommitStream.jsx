import { useEffect, useMemo, useState } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import { classificationLabel } from '../../lib/selectors'
import {
  categoryAxis,
  escapeHtml,
  legend,
  textStyle,
  tooltip,
  valueAxis,
  withAlpha
} from '../../lib/chart-style'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { cx } from '../govuk/utils.js'

export const REVEAL_MS = 1100
export const HOLD_MS = 2500
const FEED_LENGTH = 8
// The chart scrolls through the latest commits; the data table keeps them all.
export const STREAM_WINDOW = 40

const COPILOT = 'Copilot-assisted'
const HUMAN = 'Human-authored'

const isCopilot = (commit) => commit.classification === COPILOT
const commitKey = (c) => `${c.repository}-${c.prNumber}-${c.commit}`

/** A log axis when one commit would flatten the rest, e.g. 23,000 lines against a median of 20. */
function needsLogScale(timeline) {
  const sizes = timeline.map((c) => c.linesTouched).sort((a, b) => a - b)
  const peak = sizes.at(-1) ?? 0
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0
  return peak >= 100 && peak > 20 * Math.max(1, median)
}
// Each repository also gets its own symbol, so colour is not the only key.
const REPO_SYMBOLS = [
  'circle',
  'diamond',
  'triangle',
  'rect',
  'roundRect',
  'pin'
]

/**
 * Replays the period's commits one at a time, growing the axis as each lands,
 * then holds and loops. Pausing freezes the current frame (WCAG 2.2.2); the
 * data feed keeps polling. Reduced motion shows every commit at once.
 */
export function LiveCommitStream({
  timeline,
  paused = false,
  height = 340,
  colorBy = 'classification'
}) {
  const total = timeline.length
  const reducedMotion = usePrefersReducedMotion()
  const repoNames = useMemo(
    () => [...new Set(timeline.map((c) => c.repoName))].sort(),
    [timeline]
  )
  const [count, setCount] = useState(() =>
    reducedMotion ? total : Math.min(1, total)
  )
  const moving = !paused && !reducedMotion
  const shown = reducedMotion ? total : Math.min(count, total)

  useEffect(() => {
    if (!moving || total === 0) return undefined
    const atEnd = count >= total
    const id = window.setTimeout(
      () => setCount(atEnd ? 1 : count + 1),
      atEnd ? HOLD_MS : REVEAL_MS
    )
    return () => window.clearTimeout(id)
  }, [count, moving, total])

  const visible = useMemo(() => timeline.slice(0, shown), [timeline, shown])
  const plotted = useMemo(() => visible.slice(-STREAM_WINDOW), [visible])
  const logScale = useMemo(() => needsLogScale(timeline), [timeline])
  const latest = visible[visible.length - 1]

  const option = useMemo(() => {
    const p = getAppPalette()
    const byRepo = colorBy === 'repository'
    const lines = (c) =>
      logScale ? Math.max(1, c.linesTouched) : c.linesTouched
    const repoIndex = (c) => Math.max(0, repoNames.indexOf(c.repoName))
    const colorOf = (c) =>
      byRepo
        ? p.categorical[repoIndex(c) % p.categorical.length]
        : isCopilot(c)
          ? p.copilot
          : p.human
    const symbolOf = (c) =>
      byRepo
        ? REPO_SYMBOLS[repoIndex(c) % REPO_SYMBOLS.length]
        : isCopilot(c)
          ? 'circle'
          : 'diamond'
    const point = (c, i) => ({
      value: [i, lines(c)],
      symbol: symbolOf(c),
      symbolSize: Math.max(8, Math.min(24, Math.sqrt(c.linesTouched) * 2)),
      itemStyle: {
        color: colorOf(c),
        borderColor: p.white,
        borderWidth: 2,
        opacity: 0.92
      }
    })
    const groups = byRepo
      ? repoNames.map((name) => ({
          name,
          match: (c) => c.repoName === name
        }))
      : [
          { name: COPILOT, match: (c) => isCopilot(c) },
          { name: HUMAN, match: (c) => !isCopilot(c) }
        ]
    const legendData = groups.map((g, i) => {
      const sample = byRepo
        ? { repoName: g.name }
        : { classification: i === 0 ? COPILOT : HUMAN }
      return {
        name: g.name,
        icon: symbolOf(sample),
        itemStyle: { color: colorOf(sample) }
      }
    })

    return {
      animation: !reducedMotion,
      animationDurationUpdate: 600,
      animationEasingUpdate: 'cubicOut',
      grid: { left: 8, right: 20, top: 48, bottom: 8, containLabel: true },
      legend: legend(p, { data: legendData }),
      tooltip: tooltip(p, {
        trigger: 'item',
        formatter: (d) => {
          const c = plotted[d.dataIndex]
          if (!c) return ''
          return `<strong>${escapeHtml(c.repoName)} #${c.prNumber}</strong><br/>${escapeHtml(c.commit)}${byRepo ? '' : ` · ${classificationLabel(c.classification)}`}<br/>${c.linesTouched} lines touched`
        }
      }),
      xAxis: categoryAxis(
        p,
        plotted.map((c) => c.commit),
        {
          boundaryGap: true,
          axisLabel: textStyle(p, {
            color: p.muted,
            fontFamily: 'Courier New, monospace',
            hideOverlap: true
          })
        }
      ),
      yAxis: logScale
        ? valueAxis(p, 'Lines touched (log scale)', { type: 'log', min: 1 })
        : valueAxis(p, 'Lines touched', { min: null }),
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'none',
          silent: true,
          lineStyle: { width: 2, color: p.categorical[5] },
          areaStyle: { color: withAlpha(p.categorical[5], 0.15) },
          data: plotted.map(lines),
          z: 1
        },
        ...groups.map((g) => ({
          name: g.name,
          type: 'scatter',
          data: plotted.map((c, i) => (g.match(c) ? point(c, i) : null)),
          z: 2
        })),
        {
          type: 'effectScatter',
          silent: true,
          rippleEffect: { scale: 2.6, brushType: 'stroke', period: 2.4 },
          data: moving && latest ? [point(latest, plotted.length - 1)] : [],
          z: 3
        }
      ]
    }
  }, [plotted, latest, moving, reducedMotion, colorBy, repoNames, logScale])

  const feed = visible.slice(-FEED_LENGTH).reverse()
  const byClass = colorBy !== 'repository'

  return (
    <div className="app-live-stream">
      <p className="govuk-body-s app-live-header__status" role="status">
        {latest
          ? `Latest: ${latest.repoName} #${latest.prNumber} · ${latest.commit} · ${byClass ? `${classificationLabel(latest.classification)} · ` : ''}${latest.linesTouched} lines`
          : 'Awaiting commits…'}
      </p>
      <div className="app-live">
        <div className="app-live__chart">
          <Chart
            option={option}
            height={height}
            ariaLabel={`Live commit stream. ${visible.length} of ${total} commits shown, the latest ${plotted.length} plotted by lines touched${logScale ? ' on a log scale' : ''}. ${byClass ? 'Copilot-assisted commits are circles and human-authored commits are diamonds.' : 'Each repository has its own colour and symbol.'}`}
            dataTable={
              <table>
                <caption>Commit stream — lines touched by commit</caption>
                <thead>
                  <tr>
                    <th scope="col">Commit</th>
                    <th scope="col">Repository</th>
                    <th scope="col">PR</th>
                    {byClass && <th scope="col">Classification</th>}
                    <th scope="col">Lines touched</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={commitKey(c)}>
                      <td>{c.commit}</td>
                      <td>{c.repoName}</td>
                      <td>#{c.prNumber}</td>
                      {byClass && <td>{c.classification}</td>}
                      <td>{c.linesTouched}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="app-live__feed">
          <ol className="app-feed" aria-label="Latest commits, newest first">
            {feed.map((c, i) => (
              <li
                key={commitKey(c)}
                className={cx(
                  'app-feed__item',
                  i === 0 && moving && 'app-feed__item--new'
                )}
              >
                <span className="app-avatar app-avatar--s" aria-hidden="true">
                  {(c.author ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="app-feed__content">
                  <p className="app-feed__msg" title={c.subject || undefined}>
                    <span className="app-sha">{c.commit.slice(0, 7)}</span>{' '}
                    {c.subject || 'No commit message'}
                  </p>
                  <p className="app-feed__meta">
                    {c.author ?? 'Unknown'} · {c.repoName} · PR #{c.prNumber} ·
                    +{c.linesAdded ?? 0} −{c.linesDeleted ?? 0}
                  </p>
                </div>
                <span
                  className={cx(
                    'app-badge',
                    isCopilot(c) ? 'app-badge--copilot' : 'app-badge--human'
                  )}
                >
                  {isCopilot(c) ? 'Copilot' : 'Human'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
