import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/**
 * Treemap of hierarchical composition — repo → PR → lines touched. Area encodes
 * volume; colour intensity encodes Copilot assist rate. Clicking a repo tile
 * can drive drill-down via `onSelect`.
 */
export function BreakdownTreemap({
  nodes,
  title,
  theme,
  height = 360,
  onSelect
}) {
  // nodes: [{ name, value, rate, key, children? }]
  const option = useMemo(() => {
    const p = getPalette()
    const colorForRate = (r) => {
      if (r >= 80) return p.sequential[4]
      if (r >= 65) return p.sequential[3]
      if (r >= 50) return p.sequential[2]
      if (r >= 30) return p.sequential[1]
      return p.sequential[0]
    }

    const decorate = (list) =>
      list.map((n) => ({
        name: n.name,
        value: n.value,
        key: n.key,
        itemStyle: {
          color: colorForRate(n.rate),
          borderColor: p.surface,
          borderWidth: 2
        },
        label: { formatter: `${n.name}\n${n.rate}%` },
        children: n.children ? decorate(n.children) : undefined
      }))

    return {
      tooltip: {
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (info) =>
          `<b>${info.name}</b><br/>Lines touched: ${info.value}<br/>Assist rate: ${
            info.data.label?.formatter?.split('\n')[1] ?? ''
          }`
      },
      series: [
        {
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            color: p.text,
            fontSize: 12,
            fontWeight: 600,
            overflow: 'truncate'
          },
          upperLabel: { show: false },
          itemStyle: { gapWidth: 2 },
          levels: [{ itemStyle: { gapWidth: 3 } }],
          data: decorate(nodes)
        }
      ]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, theme])

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
