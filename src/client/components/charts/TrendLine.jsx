import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import {
  LINE_TYPES,
  SYMBOLS,
  categoryAxis,
  textStyle,
  tooltip,
  valueAxis
} from '../../lib/chart-style'

const MAX_TREND_LINES = 4

/**
 * Line chart for trends over time. Plots at most four series, each with its
 * own dash and marker plus a direct end label instead of a legend.
 */
export function TrendLine({
  categories,
  series,
  title,
  unit = '',
  height = 320
}) {
  const option = useMemo(() => {
    const p = getAppPalette()
    const colorFor = (token, i) =>
      ({
        copilot: p.copilot,
        accent: p.family.leverage.band,
        success: p.family.adoption.band
      })[token] ?? p.categorical[i % p.categorical.length]
    return {
      grid: { left: 8, right: 120, top: 32, bottom: 8, containLabel: true },
      tooltip: tooltip(p, { trigger: 'axis' }),
      xAxis: categoryAxis(p, categories, { boundaryGap: false }),
      yAxis: valueAxis(p, unit ? `(${unit})` : '', {
        max: 100,
        axisLabel: textStyle(p, {
          color: p.muted,
          formatter: unit ? `{value}${unit}` : '{value}'
        })
      }),
      series: series.slice(0, MAX_TREND_LINES).map((s, i) => {
        const color = colorFor(s.colorToken, i)
        return {
          name: s.name,
          type: 'line',
          symbol: SYMBOLS[i],
          symbolSize: 8,
          lineStyle: { width: 3, color, type: LINE_TYPES[i] },
          itemStyle: { color, borderColor: p.white, borderWidth: 1 },
          endLabel: textStyle(p, {
            show: true,
            formatter: '{a}',
            fontWeight: 'bold',
            distance: 8
          }),
          labelLayout: { moveOverlap: 'shiftY' },
          emphasis: { focus: 'series' },
          data: s.data
        }
      })
    }
  }, [categories, series, unit])

  return (
    <Chart
      option={option}
      height={height}
      ariaLabel={`${title}. ${series.map((s) => s.name).join(', ')} over ${categories.length} points.`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Point</th>
              {series.map((s) => (
                <th key={s.name} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c}>
                <td>{c}</td>
                {series.map((s) => (
                  <td key={s.name}>{s.data[i]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
