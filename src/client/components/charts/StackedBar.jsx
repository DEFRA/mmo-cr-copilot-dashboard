import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/**
 * Stacked bar chart. Each series shares a stack so segments read as
 * part-to-whole per category (e.g. Copilot vs manual lines per commit).
 * Optional `onSelect` makes categories clickable for drill-down.
 */
export function StackedBar({
  categories,
  series, // [{ name, data, colorToken }]
  title,
  unit = '',
  theme,
  height = 340,
  horizontal = false,
  onSelect
}) {
  const option = useMemo(() => {
    const p = getPalette()
    const tokenColor = {
      copilot: p.copilot,
      manual: p.manual,
      success: p.success,
      danger: p.danger,
      primary: p.primary,
      accent: p.accent
    }
    const catAxis = {
      type: 'category',
      data: categories,
      axisLabel: {
        color: p.text,
        interval: 0,
        rotate: horizontal ? 0 : categories.length > 6 ? 30 : 0,
        hideOverlap: true,
        fontSize: 11
      },
      axisLine: { lineStyle: { color: p.borderStrong } },
      axisTick: { show: false }
    }
    const valAxis = {
      type: 'value',
      axisLabel: {
        color: p.textMuted,
        formatter: unit ? `{value}${unit}` : '{value}',
        fontSize: 11
      },
      splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
    }
    return {
      grid: { left: horizontal ? 120 : 48, right: 24, top: 24, bottom: 48 },
      legend: { top: 0, textStyle: { color: p.textMuted }, icon: 'roundRect' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text }
      },
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: series.map((s, i) => ({
        name: s.name,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 46,
        itemStyle: {
          color:
            tokenColor[s.colorToken] ?? p.categorical[i % p.categorical.length],
          borderRadius: 2
        },
        emphasis: { focus: 'series' },
        cursor: onSelect ? 'pointer' : 'default',
        data: s.data
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, series, unit, theme, horizontal, onSelect])

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
