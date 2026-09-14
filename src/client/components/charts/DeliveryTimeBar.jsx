import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/** Parse an `rgb()/rgba()` string into `[r, g, b]`. */
function parseRgb(str) {
  const m = /rgba?\(([^)]+)\)/i.exec(str)
  if (!m) return [0, 0, 0]
  const [r, g, b] = m[1].split(',').map((n) => parseFloat(n))
  return [r, g, b]
}

/** Linear interpolation between two rgb-string colours (t in 0..1). */
function lerpColor(a, b, t) {
  const [ar, ag, ab] = parseRgb(a)
  const [br, bg, bb] = parseRgb(b)
  const mix = (x, y) => Math.round(x + (y - x) * t)
  return `rgb(${mix(ar, br)}, ${mix(ag, bg)}, ${mix(ab, bb)})`
}

/**
 * Delivery-time bar chart with status-aware colouring:
 *  • Completed PRs (valid merge date) → green.
 *  • In-progress PRs → yellow (shortest cycle) → orange (longest cycle).
 * Status is also surfaced in the tooltip and data table, so meaning never
 * relies on colour alone.
 */
export function DeliveryTimeBar({ items, title, height = 340, onSelect }) {
  // items: [{ prNumber, cycleHours, completed, prMergedAt }]
  const option = useMemo(() => {
    const p = getPalette()
    const inProgress = items
      .filter((it) => !it.completed)
      .map((it) => it.cycleHours)
    const minC = inProgress.length ? Math.min(...inProgress) : 0
    const maxC = inProgress.length ? Math.max(...inProgress) : 1
    const span = maxC - minC || 1

    const colorFor = (it) => {
      if (it.completed) return p.success
      const t = Math.max(0, Math.min(1, (it.cycleHours - minC) / span))
      return lerpColor(p.statusFast, p.statusSlow, t)
    }

    return {
      grid: { left: 56, right: 24, top: 40, bottom: 56 },
      tooltip: {
        trigger: 'item',
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (params) => {
          const it = items[params.dataIndex]
          const status = it.completed ? 'Completed' : 'In progress'
          const merged =
            it.completed && it.prMergedAt
              ? `<br/>Merged: ${new Date(it.prMergedAt).toLocaleString(
                  undefined,
                  {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }
                )}`
              : ''
          return `<b>PR #${it.prNumber}</b><br/>Cycle time: <b>${it.cycleHours}h</b><br/>Status: ${status}${merged}`
        }
      },
      xAxis: {
        type: 'category',
        data: items.map((it) => `#${it.prNumber}`),
        axisLabel: {
          color: p.text,
          interval: 0,
          rotate: items.length > 6 ? 30 : 0,
          hideOverlap: true,
          fontSize: 11
        },
        axisLine: { lineStyle: { color: p.borderStrong } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'Cycle time (h)',
        nameLocation: 'end',
        nameGap: 16,
        nameTextStyle: { color: p.textMuted, fontSize: 11, align: 'left' },
        axisLabel: { color: p.textMuted, formatter: '{value}h', fontSize: 11 },
        splitLine: { lineStyle: { color: p.border, opacity: 0.6 } }
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 44,
          cursor: onSelect ? 'pointer' : 'default',
          emphasis: { itemStyle: { opacity: 0.85 } },
          data: items.map((it) => ({
            value: it.cycleHours,
            itemStyle: { color: colorFor(it), borderRadius: [6, 6, 0, 0] }
          }))
        }
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
