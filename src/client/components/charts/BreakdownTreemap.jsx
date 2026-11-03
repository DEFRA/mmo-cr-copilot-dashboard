import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import { escapeHtml, textStyle, tooltip } from '../../lib/chart-style'

/**
 * Treemap of hierarchical composition — repo → PR → lines touched. Area encodes
 * volume; a three-step assist scale encodes Copilot assist rate, which is also
 * written on every tile. Clicking a repo tile can drive drill-down via `onSelect`.
 */
export function BreakdownTreemap({ nodes, title, height = 360, onSelect }) {
  // nodes: [{ name, value, rate, key, children? }]
  const option = useMemo(() => {
    const p = getAppPalette()
    const assist = p.family.assist
    const styleForRate = (r) => {
      if (r >= 65) return { fill: assist.ink, ink: p.white }
      if (r >= 30) return { fill: assist.band, ink: p.text }
      return { fill: assist.tint, ink: p.text }
    }

    const decorate = (list) =>
      list.map((n) => {
        const { fill, ink } = styleForRate(n.rate)
        return {
          name: n.name,
          value: n.value,
          key: n.key,
          rate: n.rate,
          itemStyle: { color: fill, borderColor: p.white, borderWidth: 2 },
          label: { color: ink, formatter: `{b}\n${n.rate ?? '—'}%` },
          children: n.children ? decorate(n.children) : undefined
        }
      })

    return {
      tooltip: tooltip(p, {
        formatter: (info) =>
          `<b>${escapeHtml(info.name)}</b><br/>Lines touched: ${info.value}<br/>Assist rate: ${info.data.rate ?? '—'}%`
      }),
      series: [
        {
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          width: '100%',
          height: '100%',
          label: textStyle(p, {
            fontWeight: 'bold',
            lineHeight: 18,
            overflow: 'truncate'
          }),
          upperLabel: { show: false },
          itemStyle: { gapWidth: 2 },
          levels: [{ itemStyle: { gapWidth: 3 } }],
          data: decorate(nodes)
        }
      ]
    }
  }, [nodes])

  const handleEvents = useMemo(
    () =>
      onSelect
        ? { click: (params) => params.data?.key && onSelect(params.data.key) }
        : undefined,
    [onSelect]
  )

  return (
    <Chart
      option={option}
      height={height}
      onEvents={handleEvents}
      ariaLabel={`${title}. ${nodes
        .map((n) => `${n.name}: ${n.value} lines, ${n.rate}% assist rate`)
        .join('; ')}.`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Lines touched</th>
              <th scope="col">Assist rate</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.name}>
                <td>{n.name}</td>
                <td>{n.value}</td>
                <td>{n.rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
