import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import { decal, escapeHtml, legend, tooltip } from '../../lib/chart-style'

/**
 * Pie of each model's share of requests. Colour is paired with a hatch pattern
 * and the legend and tooltip carry the percentage; the table beside it holds
 * the exact figures.
 */
export function ModelSharePie({ shares, height = 280 }) {
  const option = useMemo(() => {
    const p = getAppPalette()
    return {
      tooltip: tooltip(p, {
        trigger: 'item',
        formatter: ({ name, value, data }) =>
          `${escapeHtml(data?.model ?? name)}: ${value} requests (${data.share}%)`
      }),
      legend: legend(p, {
        type: 'scroll',
        top: undefined,
        right: undefined,
        bottom: 0,
        left: 'center',
        formatter: (id) => {
          const entry = shares.find((s) => s.id === id)
          return entry ? `${entry.model} ${entry.share}%` : id
        }
      }),
      series: [
        {
          type: 'pie',
          radius: ['0%', '68%'],
          center: ['50%', '42%'],
          itemStyle: { borderColor: p.white, borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          // ECharts keys the legend on name, so it carries the id and the label is formatted.
          data: shares.map((s, i) => ({
            name: s.id,
            model: s.model,
            value: s.requests,
            share: s.share,
            itemStyle: {
              color: p.categorical[i % p.categorical.length],
              decal: decal(p, i)
            }
          }))
        }
      ]
    }
  }, [shares])

  return (
    <Chart
      option={option}
      height={height}
      ariaLabel={`Share of Requests by Model: ${shares
        .map((s) => `${s.model} ${s.share}%`)
        .join(', ')}`}
    />
  )
}
