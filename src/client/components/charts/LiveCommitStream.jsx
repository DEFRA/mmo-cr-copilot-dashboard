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

// A log axis once the largest commit is this many lines and this many times the median.
const LOG_SCALE_MIN_PEAK = 100
const LOG_SCALE_RATIO = 20
const AREA_ALPHA = 0.15
const SHORT_SHA_LENGTH = 7
const TREND_COLOUR_INDEX = 5

/** A log axis when one commit would flatten the rest, e.g. 23,000 lines against a median of 20. */
function needsLogScale(timeline) {
  const sizes = timeline.map((c) => c.linesTouched).sort((a, b) => a - b)
  const peak = sizes.at(-1) ?? 0
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0
  return (
    peak >= LOG_SCALE_MIN_PEAK && peak > LOG_SCALE_RATIO * Math.max(1, median)
  )
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

// Colour and symbol per commit: by repository, or Copilot circles against human diamonds.
function markerStyle(p, byRepo, repoNames) {
  const repoIndex = (c) => Math.max(0, repoNames.indexOf(c.repoName))
  if (byRepo) {
    return {
      colorOf: (c) => p.categorical[repoIndex(c) % p.categorical.length],
      symbolOf: (c) => REPO_SYMBOLS[repoIndex(c) % REPO_SYMBOLS.length]
    }
  }
  return {
    colorOf: (c) => (isCopilot(c) ? p.copilot : p.human),
    symbolOf: (c) => (isCopilot(c) ? 'circle' : 'diamond')
  }
}

function seriesGroups(byRepo, repoNames) {
  if (byRepo) {
    return repoNames.map((name) => ({
      name,
      sample: { repoName: name },
      match: (c) => c.repoName === name
    }))
  }
  return [
    { name: COPILOT, sample: { classification: COPILOT }, match: isCopilot },
    {
      name: HUMAN,
      sample: { classification: HUMAN },
      match: (c) => !isCopilot(c)
    }
  ]
}

function pointTooltip(c, byRepo) {
  if (!c) {
    return ''
  }
  const kind = byRepo ? '' : ` · ${classificationLabel(c.classification)}`
  return `<strong>${escapeHtml(c.repoName)} #${c.prNumber}</strong><br/>${escapeHtml(c.commit)}${kind}<br/>${c.linesTouched} lines touched`
}

function streamOption({
  plotted,
  latest,
  moving,
  reducedMotion,
  byRepo,
  repoNames,
  logScale
}) {
  const p = getAppPalette()
  const lines = (c) => (logScale ? Math.max(1, c.linesTouched) : c.linesTouched)
  const { colorOf, symbolOf } = markerStyle(p, byRepo, repoNames)
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
  const groups = seriesGroups(byRepo, repoNames)
  const trend = p.categorical[TREND_COLOUR_INDEX]
  return {
    animation: !reducedMotion,
    animationDurationUpdate: 600,
    animationEasingUpdate: 'cubicOut',
    grid: { left: 8, right: 20, top: 48, bottom: 8, containLabel: true },
    legend: legend(p, {
      data: groups.map((g) => ({
        name: g.name,
        icon: symbolOf(g.sample),
        itemStyle: { color: colorOf(g.sample) }
      }))
    }),
    tooltip: tooltip(p, {
      trigger: 'item',
      formatter: (d) => pointTooltip(plotted[d.dataIndex], byRepo)
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
    series: streamSeries({
      plotted,
      latest,
      moving,
      groups,
      point,
      lines,
      trend
    })
  }
}

function streamSeries({
  plotted,
  latest,
  moving,
  groups,
  point,
  lines,
  trend
}) {
  return [
    {
      type: 'line',
      smooth: true,
      symbol: 'none',
      silent: true,
      lineStyle: { width: 2, color: trend },
      areaStyle: { color: withAlpha(trend, AREA_ALPHA) },
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

function latestText(latest, byClass) {
  if (!latest) {
    return 'Awaiting commits…'
  }
  const kind = byClass ? `${classificationLabel(latest.classification)} · ` : ''
  return `Latest: ${latest.repoName} #${latest.prNumber} · ${latest.commit} · ${kind}${latest.linesTouched} lines`
}

function streamLabel({ shownCount, total, plottedCount, logScale, byClass }) {
  const scale = logScale ? ' on a log scale' : ''
  const key = byClass
    ? 'Copilot-assisted commits are circles and human-authored commits are diamonds.'
    : 'Each repository has its own colour and symbol.'
  return `Live commit stream. ${shownCount} of ${total} commits shown, the latest ${plottedCount} plotted by lines touched${scale}. ${key}`
}

function StreamTable({ commits, byClass }) {
  return (
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
        {commits.map((c) => (
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
  )
}

function FeedItem({ c, fresh }) {
  const copilot = isCopilot(c)
  return (
    <li className={cx('app-feed__item', fresh && 'app-feed__item--new')}>
      <span className="app-avatar app-avatar--s" aria-hidden="true">
        {(c.author ?? '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="app-feed__content">
        <p className="app-feed__msg" title={c.subject || undefined}>
          <span className="app-sha">{c.commit.slice(0, SHORT_SHA_LENGTH)}</span>{' '}
          {c.subject || 'No commit message'}
        </p>
        <p className="app-feed__meta">
          {c.author ?? 'Unknown'} · {c.repoName} · PR #{c.prNumber} · +
          {c.linesAdded ?? 0} −{c.linesDeleted ?? 0}
        </p>
      </div>
      <span
        className={cx(
          'app-badge',
          copilot ? 'app-badge--copilot' : 'app-badge--human'
        )}
      >
        {copilot ? 'Copilot' : 'Human'}
      </span>
    </li>
  )
}

function CommitFeed({ commits, moving }) {
  return (
    <ol className="app-feed" aria-label="Latest commits, newest first">
      {commits.map((c, i) => (
        <FeedItem key={commitKey(c)} c={c} fresh={i === 0 && moving} />
      ))}
    </ol>
  )
}

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
    () =>
      [...new Set(timeline.map((c) => c.repoName))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [timeline]
  )
  const [count, setCount] = useState(() =>
    reducedMotion ? total : Math.min(1, total)
  )
  const moving = !paused && !reducedMotion
  const shown = reducedMotion ? total : Math.min(count, total)

  useEffect(() => {
    if (!moving || total === 0) {
      return undefined
    }
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
  const latest = visible.at(-1)
  const byRepo = colorBy === 'repository'

  const option = useMemo(
    () =>
      streamOption({
        plotted,
        latest,
        moving,
        reducedMotion,
        byRepo,
        repoNames,
        logScale
      }),
    [plotted, latest, moving, reducedMotion, byRepo, repoNames, logScale]
  )

  return (
    <div className="app-live-stream">
      <output className="govuk-body-s app-block app-live-header__status">
        {latestText(latest, !byRepo)}
      </output>
      <div className="app-live">
        <div className="app-live__chart">
          <Chart
            option={option}
            height={height}
            ariaLabel={streamLabel({
              shownCount: visible.length,
              total,
              plottedCount: plotted.length,
              logScale,
              byClass: !byRepo
            })}
            dataTable={<StreamTable commits={visible} byClass={!byRepo} />}
          />
        </div>
        <div className="app-live__feed">
          <CommitFeed
            commits={visible.slice(-FEED_LENGTH).reverse()}
            moving={moving}
          />
        </div>
      </div>
    </div>
  )
}
