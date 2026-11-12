import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import {
  barLabels,
  categoryAxis,
  categoryZoom,
  decal,
  legend,
  textStyle,
  tooltip,
  valueAxis
} from '../../lib/chart-style'

const IN_PROGRESS = 'In progress'
const statusText = (it) => (it.completed ? 'Completed' : IN_PROGRESS)

const formatMerged = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

/**
 * Delivery-time bar chart. Completed PRs are solid green; in-progress PRs are
 * hatched orange. Status is also in the legend, tooltip and data table, and
 * bars carry their hours while they fit, so meaning never relies on colour.
 * Items run oldest first, so a long axis opens on the newest window.
 */
export function DeliveryTimeBar({ items, title, height = 340, onSelect }) {
  // items: [{ prNumber, cycleHours, completed, prMergedAt }]
  const option = useMemo(() => {
    const p = getAppPalette()
    const zoom = categoryZoom(p, items.length, { anchor: 'end' })
    const statusSeries = (name, completed, itemStyle) => ({
      name,
      type: 'bar',
      stack: 'status',
      barMaxWidth: 44,
      cursor: onSelect ? 'pointer' : 'default',
      itemStyle,
      ...barLabels(p, items.length, {
        position: 'top',
        formatter: (d) => (d.value ? `${d.value}h` : '')
      }),
      emphasis: { itemStyle: { opacity: 0.85 }, label: { show: true } },
      data: items.map((it) =>
        it.completed === completed ? it.cycleHours : null
      )
    })

    return {
      grid: {
        left: 8,
        right: 16,
        top: 48,
        bottom: 8 + zoom.gap,
        containLabel: true
      },
      dataZoom: zoom.dataZoom,
      legend: legend(p),
      tooltip: tooltip(p, {
        trigger: 'item',
        formatter: (params) => {
          const it = items[params.dataIndex]
          const status = statusText(it)
          const merged =
            it.completed && it.prMergedAt
              ? `<br/>Merged: ${formatMerged(it.prMergedAt)}`
              : ''
          return `<b>PR #${it.prNumber}</b><br/>Cycle time: <b>${it.cycleHours}h</b><br/>Status: ${status}${merged}`
        }
      }),
      xAxis: categoryAxis(
        p,
        items.map((it) => `#${it.prNumber}`)
      ),
      yAxis: valueAxis(p, 'Cycle time (h)', {
        axisLabel: textStyle(p, { color: p.muted, formatter: '{value}h' })
      }),
      series: [
        statusSeries('Completed', true, { color: p.family.adoption.band }),
        statusSeries(IN_PROGRESS, false, {
          color: p.family.risk.band,
          decal: decal(p)
        })
      ]
    }
  }, [items, onSelect])

  const handleEvents = useMemo(
    () =>
      onSelect ? { click: (params) => onSelect(params.dataIndex) } : undefined,
    [onSelect]
  )

  return (
    <Chart
      option={option}
      height={height}
      onEvents={handleEvents}
      ariaLabel={`${title}. ${items
        .map(
          (it) =>
            `PR #${it.prNumber}: ${it.cycleHours} hours, ${it.completed ? 'completed' : 'in progress'}`
        )
        .join('; ')}.`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Pull request</th>
              <th scope="col">Cycle time (h)</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.prNumber}>
                <td>#{it.prNumber}</td>
                <td>{it.cycleHours}</td>
                <td>{statusText(it)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
