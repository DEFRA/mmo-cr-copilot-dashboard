import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import {
  categoryAxis,
  escapeHtml,
  textStyle,
  tooltip
} from '../../lib/chart-style'

// Above this rate the cell is dark enough that only white text meets 4.5:1.
const WHITE_TEXT_FROM = 80
const CONTRIBUTOR_LABEL_WIDTH = 48

/**
 * Heatmap of a value across two categorical axes (contributor × repository
 * assist rate). Every cell is labelled with its value; null cells read as
 * "no activity".
 */
export function ActivityHeatmap({
  xLabels,
  yLabels,
  data,
  title,
  height = 340,
  onSelectContributor,
  onSelectCell
}) {
  // data: [xIndex, yIndex, value|null]
  const option = useMemo(() => {
    const p = getAppPalette()
    const assist = p.family.assist
    const cells = data.map(([x, y, v]) => ({
      value: [x, y, v == null ? '-' : v],
      label: { color: v > WHITE_TEXT_FROM ? p.white : p.text }
    }))
    return {
      grid: { left: 8, right: 16, top: 56, bottom: 8, containLabel: true },
      tooltip: tooltip(p, {
        position: 'top',
        formatter: (params) => {
          const [x, y, v] = params.data.value
          return `${escapeHtml(yLabels[y])} · ${escapeHtml(xLabels[x])}<br/><b>${v === '-' ? 'No activity' : `${v}%`}</b>`
        }
      }),
      xAxis: categoryAxis(p, xLabels, {
        position: 'top',
        axisLabel: textStyle(p, {
          interval: 0,
          width: 110,
          overflow: 'truncate',
          hideOverlap: true
        })
      }),
      yAxis: categoryAxis(p, yLabels, {
        inverse: true,
        triggerEvent: Boolean(onSelectContributor),
        // Full name on hover, since long handles are truncated below.
        tooltip: { show: true },
        axisLabel: textStyle(p, {
          // Fits "charlie" in 14px bold Arial; longer handles truncate.
          width: CONTRIBUTOR_LABEL_WIDTH,
          overflow: 'truncate',
          ellipsis: '…',
          // Styled like .app-chip so the clickable names read as buttons.
          ...(onSelectContributor && {
            color: p.brandInk,
            fontWeight: 600,
            backgroundColor: p.white,
            borderColor: p.brand,
            borderWidth: 2,
            borderRadius: 999,
            padding: [4, 8]
          })
        })
      }),
      visualMap: {
        min: 0,
        max: 100,
        calculable: false,
        orient: 'horizontal',
        right: 0,
        top: 0,
        itemWidth: 12,
        itemHeight: 120,
        text: ['100%', '0%'],
        textStyle: textStyle(p, { color: p.muted }),
        inRange: { color: [assist.tint, assist.band, assist.ink] }
      },
      series: [
        {
          name: title,
          type: 'heatmap',
          cursor: 'pointer',
          data: cells,
          label: textStyle(p, {
            show: true,
            formatter: (params) =>
              params.data.value[2] === '-' ? '' : `${params.data.value[2]}%`
          }),
          itemStyle: { borderColor: p.white, borderWidth: 2 },
          emphasis: { itemStyle: { borderColor: p.text, borderWidth: 2 } }
        }
      ]
    }
  }, [xLabels, yLabels, data, title, onSelectContributor])

  const handleEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType === 'yAxis') {
          onSelectContributor?.(params.value)
        } else if (params.componentType === 'series') {
          const [x, y, v] = params.data.value
          if (v !== '-') onSelectCell?.(xLabels[x], yLabels[y])
        }
      }
    }),
    [onSelectContributor, onSelectCell, xLabels, yLabels]
  )

  return (
    <div>
      <Chart
        option={option}
        height={height}
        onEvents={handleEvents}
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
    </div>
  )
}
