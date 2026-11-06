import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import {
  categoryAxis,
  decal,
  legend,
  textStyle,
  tooltip,
  valueAxis
} from '../../lib/chart-style'

/**
 * Stacked bar chart. Each series shares a stack so segments read as
 * part-to-whole per category (e.g. Copilot vs human lines per commit). Every
 * series after the first carries a decal pattern so colour is not the only key.
 */
export function StackedBar({
  categories,
  series, // [{ name, data, colorToken }]
  title,
  unit = '',
  height = 340,
  horizontal = false,
  grouped = false,
  onSelect
}) {
  const option = useMemo(() => {
    const p = getAppPalette()
    const tokenColor = {
      copilot: p.copilot,
      manual: p.human,
      success: p.family.adoption.band,
      danger: p.error,
      primary: p.brand,
      accent: p.family.leverage.band
    }
    const decalFor = (s, i) => {
      if (s.colorToken === 'copilot') return undefined
      return decal(p, s.colorToken === 'manual' ? 1 : i)
    }
    const catAxis = categoryAxis(p, categories)
    const valAxis = valueAxis(p, unit ? `(${unit})` : '', {
      axisLabel: textStyle(p, {
        color: p.muted,
        formatter: unit ? `{value}${unit}` : '{value}'
      })
    })
    return {
      grid: { left: 8, right: 16, top: 48, bottom: 8, containLabel: true },
      legend: legend(p),
      tooltip: tooltip(p, { trigger: 'axis', axisPointer: { type: 'shadow' } }),
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: series.map((s, i) => ({
        name: s.name,
        type: 'bar',
        stack: grouped ? undefined : 'total',
        barMaxWidth: 46,
        itemStyle: {
          color:
            tokenColor[s.colorToken] ?? p.categorical[i % p.categorical.length],
          borderColor: p.white,
          borderWidth: 1,
          decal: decalFor(s, i)
        },
        emphasis: { focus: 'series' },
        cursor: onSelect ? 'pointer' : 'default',
        data: s.data
      }))
    }
  }, [categories, series, unit, horizontal, grouped, onSelect])

  const handleEvents = useMemo(
    () =>
      onSelect
        ? {
            click: (params) =>
              onSelect(params.dataIndex, categories[params.dataIndex])
          }
        : undefined,
    [onSelect, categories]
  )

  return (
    <Chart
      option={option}
      height={height}
      onEvents={handleEvents}
      ariaLabel={`${title}. Categories: ${categories.join(', ')}. Series: ${series
        .map((s) => s.name)
        .join(', ')}.`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
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
