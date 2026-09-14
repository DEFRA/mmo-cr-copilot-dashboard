import { useMemo, useCallback } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/**
 * Vertical bar chart comparing a single value across categories. When
 * `onSelect` is provided each bar is clickable and drives a drill-down; a hint
 * row and keyboard-navigable fallback list keep it accessible.
 */
export function CategoryBar({
  categories,
  values,
  seriesName,
  unit = '',
  title,
  theme,
  height = 320,
  onSelect,
  horizontal = false,
  colorByValue = false
}) {
  const option = useMemo(() => {
    const p = getPalette()
    const bandColor = (v) => {
      if (!colorByValue) return p.primary
      if (v >= 75) return p.success
      if (v >= 50) return p.warning
      return p.danger
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
      grid: {
        left: horizontal ? 120 : 48,
        right: 24,
        top: 24,
        bottom: horizontal ? 32 : 56
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (params) => {
          const d = params[0]
          return `${d.name}<br/><b>${d.value}${unit}</b> ${seriesName}`
        }
      },
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: [
        {
          name: seriesName,
          type: 'bar',
          barMaxWidth: 42,
          itemStyle: {
            borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0],
            color: (params) => bandColor(params.value)
          },
          emphasis: { focus: 'series', itemStyle: { opacity: 0.85 } },
          cursor: onSelect ? 'pointer' : 'default',
          data: values
        }
      ]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    categories,
    values,
    seriesName,
    unit,
    theme,
    horizontal,
    colorByValue,
    onSelect
  ])

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

  const selectByIndex = useCallback(
    (i) => onSelect?.(i, categories[i]),
    [onSelect, categories]
  )

  return (
    <div>
      <Chart
        option={option}
        height={height}
        onEvents={handleEvents}
        ariaLabel={`${title}. ${categories
          .map((c, i) => `${c}: ${values[i]}${unit}`)
          .join(', ')}`}
        dataTable={
          <table>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">
                  {seriesName} {unit && `(${unit})`}
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{values[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
      {onSelect && (
        <ul
          className="mt-2 flex flex-wrap gap-1.5"
          aria-label={`Select a ${seriesName} category to drill down`}
        >
          {categories.map((c, i) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => selectByIndex(i)}
                className="focus-ring pill hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {c}
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
