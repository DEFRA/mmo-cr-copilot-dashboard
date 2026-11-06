import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import { decal, textStyle, tooltip } from '../../lib/chart-style'

/**
 * Donut showing part-to-whole composition (Copilot vs human). Segments carry
 * direct labels and Human is hatched, so meaning never relies on colour alone.
 */
export function DistributionDonut({ data, title, height = 260 }) {
  const option = useMemo(() => {
    const p = getAppPalette()
    const isCopilot = (name) => name.toLowerCase().includes('copilot')
    return {
      tooltip: tooltip(p, { trigger: 'item', formatter: '{b}: {c} ({d}%)' }),
      series: [
        {
          type: 'pie',
          radius: ['50%', '72%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: p.white, borderWidth: 2 },
          label: textStyle(p, {
            show: true,
            formatter: '{b}\n{d}%',
            fontWeight: 'bold',
            lineHeight: 18
          }),
          labelLine: { length: 8, length2: 8, lineStyle: { color: p.muted } },
          data: data.map((d) => ({
            name: d.name,
            value: d.value,
            itemStyle: isCopilot(d.name)
              ? { color: p.copilot }
              : { color: p.human, decal: decal(p) }
          }))
        }
      ]
    }
  }, [data])

  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <Chart
      option={option}
      height={height}
      ariaLabel={`${title}: ${data
        .map((d) => `${d.name} ${d.value}`)
        .join(', ')}`}
      dataTable={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Value</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td>{d.value}</td>
                <td>{total ? ((d.value / total) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
