import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/**
 * Heatmap of a value across two categorical axes (contributor × repository
 * assist rate). Uses a sequential visualMap; null cells render as "no activity".
 */
export function ActivityHeatmap({
  xLabels,
  yLabels,
  data,
  title,
  theme,
  height = 340
}) {
  // data: [xIndex, yIndex, value|null]
  const option = useMemo(() => {
    const p = getPalette()
    const cells = data.map(([x, y, v]) => [x, y, v == null ? '-' : v])
    return {
      grid: { left: 120, right: 24, top: 48, bottom: 48 },
      tooltip: {
        position: 'top',
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (params) => {
          const [x, y, v] = params.data
          return `${yLabels[y]} · ${xLabels[x]}<br/><b>${v === '-' ? 'No activity' : `${v}%`}</b>`
        }
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        splitArea: { show: true },
        axisLabel: {
          color: p.text,
          rotate: xLabels.length > 4 ? 20 : 0,
          hideOverlap: true,
          fontSize: 11
        },
        axisLine: { lineStyle: { color: p.borderStrong } }
      },
      yAxis: {
        type: 'category',
        data: yLabels,
        splitArea: { show: true },
        axisLabel: { color: p.text, fontSize: 11 },
        axisLine: { lineStyle: { color: p.borderStrong } }
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        top: 6,
        itemWidth: 14,
        itemHeight: 140,
        text: ['High', 'Low'],
        textStyle: { color: p.textMuted, fontSize: 11 },
        inRange: { color: p.heat }
      },
      series: [
        {
          name: title,
          type: 'heatmap',
          data: cells,
          label: {
            show: true,
            color: p.heatInk,
            formatter: (params) =>
              params.data[2] === '-' ? '' : `${params.data[2]}%`
          },
          itemStyle: {
            borderColor: p.surface,
            borderWidth: 2,
            borderRadius: 4
          },
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: p.border } }
        }
      ]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xLabels, yLabels, data, title, theme])

  return (
    <Chart
      option={option}
      height={height}
      ariaLabel={`${title}. Assist rate for ${yLabels.length} contributors across ${xLabels.length} repositories.`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Contributor</th>
              {xLabels.map((x) => (
                <th key={x} scope="col">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yLabels.map((y, yi) => (
              <tr key={y}>
                <td>{y}</td>
                {xLabels.map((x, xi) => {
                  const cell = data.find(([dx, dy]) => dx === xi && dy === yi)
                  const v = cell ? cell[2] : null
                  return <td key={x}>{v == null ? '—' : `${v}%`}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
