import { useMemo, useCallback } from 'react'
import { Chart } from './Chart'
import { Details } from '../govuk'
import { getAppPalette } from '../../lib/palette'
import {
  BAR_LABEL_LIMIT,
  barLabels,
  categoryAxis,
  categoryZoom,
  escapeHtml,
  textStyle,
  tooltip,
  valueAxis
} from '../../lib/chart-style'

/**
 * Bar chart comparing a single value across categories. Bars carry value labels
 * while they fit; a long axis scrolls through a slider window from `zoomAnchor`.
 * When `onSelect` is provided each bar is clickable and a
 * keyboard-navigable fallback list keeps the drill-down accessible.
 */
export function CategoryBar({
  categories,
  values,
  seriesName,
  unit = '',
  title,
  height = 320,
  onSelect,
  horizontal = false,
  colorByValue = false,
  hideCategoryLabels = false,
  showSelectList = true,
  zoomAnchor = 'start'
}) {
  const option = useMemo(() => {
    const p = getAppPalette()
    const bandColor = (v) => {
      if (!colorByValue) return p.categorical[0]
      if (v >= 75) return p.family.adoption.band
      if (v >= 50) return p.warning
      return p.error
    }
    // A word unit (" lines") is already on the value axis; repeating it widens every label.
    const labelUnit = unit.trim().length > 2 ? '' : unit
    const zoom = categoryZoom(p, categories.length, {
      axis: horizontal ? 'y' : 'x',
      anchor: zoomAnchor
    })
    const catAxis = categoryAxis(p, categories, {
      axisLabel: textStyle(p, {
        show: !hideCategoryLabels,
        color: p.muted,
        hideOverlap: true
      })
    })
    const valAxis = valueAxis(p, '', {
      axisLabel: textStyle(p, {
        color: p.muted,
        formatter: unit ? `{value}${unit}` : '{value}'
      })
    })
    return {
      grid: {
        left: 8,
        right: (horizontal ? 56 : 16) + (horizontal ? zoom.gap : 0),
        top: 32,
        bottom: 8 + (horizontal ? 0 : zoom.gap),
        containLabel: true
      },
      dataZoom: zoom.dataZoom,
      tooltip: tooltip(p, {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const d = params[0]
          return `${escapeHtml(d.name)}<br/><b>${d.value}${escapeHtml(unit)}</b> ${escapeHtml(seriesName)}`
        }
      }),
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: [
        {
          name: seriesName,
          type: 'bar',
          barMaxWidth: 42,
          itemStyle: { color: (params) => bandColor(params.value) },
          ...barLabels(p, categories.length, {
            position: horizontal ? 'right' : 'top',
            formatter: `{c}${labelUnit}`
          }),
          emphasis: {
            focus: 'series',
            itemStyle: { opacity: 0.85 },
            label: { show: true }
          },
          cursor: onSelect ? 'pointer' : 'default',
          data: values
        }
      ]
    }
  }, [
    categories,
    values,
    seriesName,
    unit,
    horizontal,
    colorByValue,
    onSelect,
    hideCategoryLabels,
    zoomAnchor
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

  const selectList = onSelect && showSelectList && (
    <ul
      className="app-quick app-select-list"
      aria-label={`Open a ${seriesName} category`}
    >
      {categories.map((c, i) => (
        <li key={c}>
          <button
            type="button"
            className="app-chip app-chip--s"
            onClick={() => selectByIndex(i)}
          >
            {c}
          </button>
        </li>
      ))}
    </ul>
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
      {selectList &&
        (categories.length > BAR_LABEL_LIMIT ? (
          <Details
            className="govuk-!-margin-bottom-0"
            summary={`List all ${categories.length} bars`}
          >
            {selectList}
          </Details>
        ) : (
          selectList
        ))}
    </div>
  )
}
