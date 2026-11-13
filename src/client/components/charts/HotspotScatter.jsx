import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import { classificationLabel } from '../../lib/selectors'
import {
  escapeHtml,
  legend,
  textStyle,
  tooltip,
  valueAxis
} from '../../lib/chart-style'

const MIN_SYMBOL = 10
const SYMBOL_RANGE = 42

const GROUPS = [
  { category: 'Copilot-assisted', token: 'copilot', symbol: 'circle' },
  { category: 'Human-authored', token: 'human', symbol: 'diamond' }
]

/**
 * Scatter "hotspot" plot. Each point is a commit: x = lines added, y = lines
 * deleted, bubble size = total lines touched. Copilot is a purple circle and
 * Human an orange diamond, so shape carries the classification as well.
 */
export function HotspotScatter({ points, title, xName, yName, height = 340 }) {
  // points: [{ x, y, size, category, label }]
  const option = useMemo(() => {
    const p = getAppPalette()
    const maxSize = Math.max(1, ...points.map((pt) => pt.size))

    return {
      grid: { left: 8, right: 32, top: 48, bottom: 40, containLabel: true },
      legend: legend(p),
      tooltip: tooltip(p, {
        formatter: (params) => {
          const d = params.data
          return `<b>${escapeHtml(d.label)}</b><br/>${escapeHtml(xName)}: ${d.value[0]}<br/>${escapeHtml(yName)}: ${d.value[1]}<br/>Total touched: ${d.size}`
        }
      }),
      xAxis: valueAxis(p, xName, {
        nameLocation: 'middle',
        nameGap: 32,
        nameTextStyle: textStyle(p, { color: p.muted })
      }),
      yAxis: valueAxis(p, yName),
      series: GROUPS.map((g) => ({
        name: classificationLabel(g.category),
        type: 'scatter',
        // Draw in one pass: progressive chunks (from 3,000 points) can leave the SVG blank.
        progressive: 0,
        symbol: g.symbol,
        symbolSize: (data) => MIN_SYMBOL + (data.size / maxSize) * SYMBOL_RANGE,
        itemStyle: {
          color: p[g.token],
          opacity: 0.8,
          borderColor: p.white,
          borderWidth: 1
        },
        emphasis: { focus: 'series', itemStyle: { opacity: 1 } },
        data: points
          .filter((pt) => pt.category === g.category)
          .map((pt) => ({
            value: [pt.x, pt.y],
            size: pt.size,
            label: pt.label
          }))
      }))
    }
  }, [points, xName, yName])

  return (
    <Chart
      option={option}
      height={height}
      ariaLabel={`${title}. ${points.length} commits plotted by ${xName} versus ${yName}, sized by total lines touched.`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Commit</th>
              <th scope="col">{xName}</th>
              <th scope="col">{yName}</th>
              <th scope="col">Total touched</th>
              <th scope="col">Classification</th>
            </tr>
          </thead>
          <tbody>
            {points.map((pt) => (
              <tr key={pt.label}>
                <td>{pt.label}</td>
                <td>{pt.x}</td>
                <td>{pt.y}</td>
                <td>{pt.size}</td>
                <td>{classificationLabel(pt.category)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
