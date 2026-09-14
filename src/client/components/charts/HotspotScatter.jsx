import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'
import { classificationLabel } from '../../lib/selectors'

/**
 * Scatter "hotspot" plot. Each point is a commit: x = lines added, y = lines
 * deleted, bubble size = total lines touched, colour = classification. Reveals
 * large/risky changes and where Copilot vs manual effort concentrates.
 */
export function HotspotScatter({
  points,
  title,
  xName,
  yName,
  theme,
  height = 340
}) {
  // points: [{ x, y, size, category, label }]
  const option = useMemo(() => {
    const p = getPalette()
    const colorFor = (cat) =>
      cat?.toLowerCase().includes('copilot') ? p.copilot : p.manual
    const sizes = points.map((pt) => pt.size)
    const maxSize = Math.max(1, ...sizes)
    const groups = ['Copilot-assisted', 'Human-authored']

    return {
      grid: { left: 52, right: 24, top: 24, bottom: 52 },
      legend: { top: 0, textStyle: { color: p.textMuted }, icon: 'circle' },
      tooltip: {
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (params) => {
          const d = params.data
          return `<b>${d.label}</b><br/>${xName}: ${d.value[0]}<br/>${yName}: ${d.value[1]}<br/>Total touched: ${d.size}`
        }
      },
      xAxis: {
        type: 'value',
        name: xName,
        nameTextStyle: { color: p.textMuted, fontSize: 11 },
        axisLabel: { color: p.textMuted, fontSize: 11 },
        axisLine: { lineStyle: { color: p.borderStrong } },
        splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
      },
      yAxis: {
        type: 'value',
        name: yName,
        nameTextStyle: { color: p.textMuted, fontSize: 11 },
        axisLabel: { color: p.textMuted, fontSize: 11 },
        axisLine: { lineStyle: { color: p.borderStrong } },
        splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
      },
      series: groups.map((g) => ({
        name: classificationLabel(g),
        type: 'scatter',
        symbolSize: (data) => 10 + (data.size / maxSize) * 42,
        itemStyle: {
          color: colorFor(g),
          opacity: 0.78,
          borderColor: p.surface,
          borderWidth: 1
        },
        emphasis: { focus: 'series', itemStyle: { opacity: 1 } },
        data: points
          .filter((pt) => pt.category === g)
          .map((pt) => ({
            value: [pt.x, pt.y],
            size: pt.size,
            label: pt.label
          }))
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, xName, yName, theme])

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
