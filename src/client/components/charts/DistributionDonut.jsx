import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/**
 * Donut showing part-to-whole composition (e.g. Copilot vs manual). Segments
 * carry text labels so meaning never relies on colour alone.
 */
export function DistributionDonut({ data, title, theme, height = 260 }) {
  const option = useMemo(() => {
    const p = getPalette()
    // Donut segments are always 'Copilot-assisted' vs 'Human-authored', so a
    // single check suffices: Copilot → copilot colour, otherwise → manual.
    const colorFor = (name) =>
      name.toLowerCase().includes('copilot') ? p.copilot : p.manual
    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text }
      },
      legend: {
        bottom: 0,
        textStyle: { color: p.textMuted },
        icon: 'roundRect'
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '74%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: p.surface,
            borderWidth: 2,
            borderRadius: 6
          },
          label: {
            show: true,
            formatter: '{d}%',
            color: p.text,
            fontWeight: 600
          },
          labelLine: { length: 8, length2: 8, lineStyle: { color: p.border } },
          data: data.map((d) => ({
            name: d.name,
            value: d.value,
            itemStyle: { color: colorFor(d.name) }
          }))
        }
      ]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme])

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
