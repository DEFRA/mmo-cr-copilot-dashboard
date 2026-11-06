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

const formatMerged = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

/**
 * Delivery-time bar chart. Completed PRs are solid green; in-progress PRs are
 * hatched orange. Status is also in the legend, tooltip and data table, and
 * each bar is labelled with its hours, so meaning never relies on colour.
 */
export function DeliveryTimeBar({ items, title, height = 340, onSelect }) {
  // items: [{ prNumber, cycleHours, completed, prMergedAt }]
  const option = useMemo(() => {
    const p = getAppPalette()
    const statusSeries = (name, completed, itemStyle) => ({
      name,
      type: 'bar',
      stack: 'status',
      barMaxWidth: 44,
      cursor: onSelect ? 'pointer' : 'default',
      itemStyle,
      label: textStyle(p, { show: true, position: 'top', formatter: '{c}h' }),
      emphasis: { itemStyle: { opacity: 0.85 } },
      data: items.map((it) =>
        it.completed === completed ? it.cycleHours : null
      )
    })

    return {
      grid: { left: 8, right: 16, top: 48, bottom: 8, containLabel: true },
      legend: legend(p),
      tooltip: tooltip(p, {
        trigger: 'item',
        formatter: (params) => {
          const it = items[params.dataIndex]
          const status = it.completed ? 'Completed' : 'In progress'
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
        statusSeries('In progress', false, {
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
                <td>{it.completed ? 'Completed' : 'In progress'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
