import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'
import { formatDuration } from '../../lib/selectors'

/**
 * Cycle-time scatter for a single repository. Each point is a pull request:
 * x = merge date/time, y = cycle time (hours), bubble size = average batch
 * size, colour = Copilot assist rate. Hovering reveals every metric plus the
 * PR's contributors.
 */
export function CycleTimeScatter({ points, title, height = 400, onSelect }) {
  const option = useMemo(() => {
    const p = getPalette()
    const maxSize = Math.max(1, ...points.map((pt) => pt.batchSize))
    const assistVals = points.map((pt) => pt.assistRate)
    const minA = Math.min(0, ...assistVals)
    const maxA = Math.max(100, ...assistVals)

    return {
      grid: { left: 60, right: 28, top: 58, bottom: 48 },
      tooltip: {
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (params) => {
          const d = params.data.meta
          const contributors = d.contributors.length
            ? d.contributors.join(', ')
            : '—'
          const merged = new Date(d.mergedAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })
          return [
            `<b>PR #${d.prNumber}</b>`,
            `Merged: ${merged}`,
            `Cycle time: <b>${formatDuration(d.cycleHours)}</b>`,
            `Time to merge: ${formatDuration(d.timeToMergeHours)}`,
            `Assist rate: ${d.assistRate}%`,
            `Avg batch: ${d.batchSize} lines`,
            `Lines: +${d.linesAdded.toLocaleString()} / -${d.linesDeleted.toLocaleString()}`,
            `Contributors: ${contributors}`
          ].join('<br/>')
        }
      },
      visualMap: {
        type: 'continuous',
        min: minA,
        max: maxA,
        dimension: 3,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        top: 6,
        itemWidth: 14,
        itemHeight: 140,
        text: ['High assist', 'Low'],
        textStyle: { color: p.textMuted, fontSize: 11 },
        inRange: { color: p.sequential }
      },
      xAxis: {
        type: 'time',
        axisLabel: { color: p.textMuted, fontSize: 11, hideOverlap: true },
        axisLine: { lineStyle: { color: p.borderStrong } },
        splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
      },
      yAxis: {
        type: 'value',
        name: 'Cycle time (h)',
        nameTextStyle: { color: p.textMuted, fontSize: 11, align: 'left' },
        axisLabel: { color: p.textMuted, fontSize: 11 },
        axisLine: { lineStyle: { color: p.borderStrong } },
        splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
      },
      series: [
        {
          type: 'scatter',
          symbolSize: (val) => 12 + (val[2] / maxSize) * 40,
          itemStyle: { borderColor: p.surface, borderWidth: 1, opacity: 0.88 },
          emphasis: {
            itemStyle: { opacity: 1, borderWidth: 2, borderColor: p.text }
          },
          data: points.map((pt) => ({
            value: [pt.mergedAt, pt.cycleHours, pt.batchSize, pt.assistRate],
            meta: pt
          }))
        }
      ]
    }
  }, [points])

  const handlers = onSelect
    ? {
        click: (params) => {
          if (params.data?.meta) onSelect(params.data.meta.prNumber)
        }
      }
    : undefined

  return (
    <Chart
      option={option}
      height={height}
      onEvents={handlers}
      ariaLabel={`${title}. ${points.length} pull requests plotted by merge date versus cycle time, sized by average batch size and coloured by Copilot assist rate.`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Pull request</th>
              <th scope="col">Merged</th>
              <th scope="col">Cycle time (h)</th>
              <th scope="col">Assist rate (%)</th>
              <th scope="col">Avg batch (lines)</th>
              <th scope="col">Contributors</th>
            </tr>
          </thead>
          <tbody>
            {points.map((pt) => (
              <tr key={pt.prNumber}>
                <td>#{pt.prNumber}</td>
                <td>{new Date(pt.mergedAt).toLocaleString()}</td>
                <td>{pt.cycleHours}</td>
                <td>{pt.assistRate}</td>
                <td>{pt.batchSize}</td>
                <td>{pt.contributors.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
