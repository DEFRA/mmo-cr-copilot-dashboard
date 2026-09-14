import { useMemo } from 'react'
import { Chart } from './Chart'
import echarts from '../../lib/echarts'
import { getPalette } from '../../lib/palette'

/**
 * Multi-series area/line chart for trends over time (e.g. assist-rate per PR
 * chronologically). Gradient area fill emphasises volume/trajectory.
 */
export function TrendLine({
  categories,
  series,
  title,
  unit = '',
  theme,
  height = 320
}) {
  const option = useMemo(() => {
    const p = getPalette()
    const colorFor = (token, i) =>
      ({ copilot: p.copilot, accent: p.accent, success: p.success })[token] ??
      p.categorical[i % p.categorical.length]
    return {
      grid: { left: 44, right: 24, top: 32, bottom: 56 },
      legend: { top: 0, textStyle: { color: p.textMuted }, icon: 'roundRect' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text }
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: categories,
        axisLabel: {
          color: p.text,
          rotate: categories.length > 6 ? 30 : 0,
          hideOverlap: true,
          fontSize: 11
        },
        axisLine: { lineStyle: { color: p.borderStrong } }
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLabel: {
          color: p.textMuted,
          formatter: unit ? `{value}${unit}` : '{value}',
          fontSize: 11
        },
        splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
      },
      series: series.map((s, i) => {
        const color = colorFor(s.colorToken, i)
        return {
          name: s.name,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 3, color },
          itemStyle: { color },
          areaStyle: {
            opacity: 0.22,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color },
              { offset: 1, color: 'transparent' }
            ])
          },
          data: s.data
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, series, unit, theme])

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
