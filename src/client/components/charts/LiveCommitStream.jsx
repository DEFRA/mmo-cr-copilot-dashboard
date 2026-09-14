import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'
import { classificationLabel } from '../../lib/selectors'

const REVEAL_MS = 1100

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Live commit-level insights. Replays the chronological commit timeline as a
 * simulated real-time feed — one commit lands at a time, plotted by lines
 * touched and coloured by Copilot vs manual authorship. When the feed is
 * exhausted it loops. Honours `prefers-reduced-motion` by revealing the full
 * stream statically. The timer is always cleaned up on unmount.
 */
export function LiveCommitStream({ timeline, theme, height = 340 }) {
  const total = timeline.length
  const isStatic = reducedMotion()
  const [count, setCount] = useState(isStatic ? total : Math.min(6, total))
  const timerRef = useRef(null)

  useEffect(() => {
    if (isStatic || total === 0) return undefined
    timerRef.current = window.setInterval(() => {
      setCount((c) => (c >= total ? Math.min(6, total) : c + 1))
    }, REVEAL_MS)
    return () => window.clearInterval(timerRef.current)
  }, [isStatic, total])

  const visible = useMemo(() => timeline.slice(0, count), [timeline, count])
  const latest = visible[visible.length - 1]

  const option = useMemo(() => {
    const p = getPalette()
    const points = visible.map((c, i) => ({
      value: [i, c.linesTouched],
      itemStyle: {
        color: c.classification === 'Copilot-assisted' ? p.copilot : p.manual
      },
      symbolSize: Math.max(10, Math.min(38, Math.sqrt(c.linesTouched) * 2.2))
    }))
    return {
      grid: { left: 48, right: 20, top: 28, bottom: 40 },
      tooltip: {
        trigger: 'item',
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (d) => {
          const c = visible[d.dataIndex]
          return `<strong>${c.repoName} #${c.prNumber}</strong><br/>${c.commit} · ${classificationLabel(c.classification)}<br/>${c.linesTouched} lines touched`
        }
      },
      xAxis: {
        type: 'category',
        data: visible.map((c) => c.commit),
        axisLabel: { color: p.text, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: p.borderStrong } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'Lines touched',
        nameTextStyle: { color: p.textMuted, align: 'left' },
        axisLabel: { color: p.textMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: p.primary, opacity: 0.35 },
          data: visible.map((c, i) => [i, c.linesTouched]),
          z: 1
        },
        {
          type: 'scatter',
          data: points,
          z: 2
        }
      ]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, theme])

  return (
    <div className="flex flex-col gap-2">
      <p
        className="m-0 flex items-center gap-2 text-xs text-[var(--color-text-muted)]"
        aria-live="polite"
      >
        <span
          className="pill"
          style={{
            color: 'var(--color-success)',
            borderColor: 'var(--color-success)'
          }}
        >
          <span aria-hidden="true">●</span> Live
        </span>
        {latest
          ? `Latest: ${latest.repoName} #${latest.prNumber} · ${latest.commit} · ${classificationLabel(latest.classification)} · ${latest.linesTouched} lines`
          : 'Awaiting commits…'}
      </p>
      <Chart
        option={option}
        height={height}
        ariaLabel={`Live commit stream. ${visible.length} of ${total} commits shown, plotted by lines touched and coloured by Copilot-assisted versus manual authorship.`}
        dataTable={
          <table>
            <caption>Commit stream — lines touched by commit</caption>
            <thead>
              <tr>
                <th scope="col">Commit</th>
                <th scope="col">Repository</th>
                <th scope="col">PR</th>
                <th scope="col">Classification</th>
                <th scope="col">Lines touched</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={`${c.repository}-${c.prNumber}-${c.commit}`}>
                  <td>{c.commit}</td>
                  <td>{c.repoName}</td>
                  <td>#{c.prNumber}</td>
                  <td>{c.classification}</td>
                  <td>{c.linesTouched}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </div>
  )
}
