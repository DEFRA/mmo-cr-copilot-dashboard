import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/**
 * Radar / profile chart. Each series is a polygon across the shared indicator
 * axes (all normalised 0–100, higher = better). Ideal for comparing a handful
 * of entities as shapes. Optional `onSelect` makes each series legend entry a
 * drill-down; a keyboard-navigable fallback list mirrors it.
 */
export function ProfileRadar({
  indicators,
  series,
  title,
  subtitle,
  height = 380,
  onSelect
}) {
  const option = useMemo(() => {
    const p = getPalette()
    const colorAt = (i) => p.categorical[i % p.categorical.length]
    return {
      tooltip: {
        backgroundColor: p.surface2,
        borderColor: p.border,
        textStyle: { color: p.text },
        formatter: (params) => {
          const rows = indicators
            .map((ind, i) => `${ind.name}: <b>${params.value[i]}</b>`)
            .join('<br/>')
          return `<b>${params.name}</b><br/>${rows}`
        }
      },
      legend: {
        bottom: 0,
        type: 'scroll',
        textStyle: { color: p.textMuted },
        icon: 'roundRect'
      },
      radar: {
        indicator: indicators,
        radius: '66%',
        center: ['50%', '48%'],
        splitNumber: 4,
        axisName: { color: p.text, fontSize: 11 },
        axisLine: { lineStyle: { color: p.border } },
        splitLine: { lineStyle: { color: p.border } },
        splitArea: {
          areaStyle: { color: [p.surface, p.surface2] }
        }
      },
      series: [
        {
          type: 'radar',
          emphasis: { areaStyle: { opacity: 0.35 }, lineStyle: { width: 3 } },
          data: series.map((s, i) => ({
            name: s.name,
            value: s.values,
            symbolSize: 5,
            lineStyle: { width: 2, color: colorAt(i) },
            itemStyle: { color: colorAt(i) },
            areaStyle: { color: colorAt(i), opacity: 0.14 }
          }))
        }
      ]
    }
  }, [indicators, series])

  const handleEvents = useMemo(
    () =>
      onSelect
        ? {
            click: (params) => {
              const match = series.find((s) => s.name === params.name)
              if (match) onSelect(match.key ?? match.name)
            }
          }
        : undefined,
    [onSelect, series]
  )

  return (
    <div>
      <Chart
        option={option}
        height={height}
        onEvents={handleEvents}
        ariaLabel={`${title}. ${subtitle ?? ''} Indicators: ${indicators
          .map((i) => i.name)
          .join(', ')}. Series: ${series.map((s) => s.name).join(', ')}.`}
        dataTable={
          <table>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Repository</th>
                {indicators.map((ind) => (
                  <th key={ind.name} scope="col">
                    {ind.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.key ?? s.name}>
                  <td>{s.name}</td>
                  {s.values.map((v, i) => (
                    <td key={indicators[i].name}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
      {onSelect && (
        <ul
          className="mt-2 flex flex-wrap gap-1.5"
          aria-label="Open a repository"
        >
          {series.map((s) => (
            <li key={s.key ?? s.name}>
              <button
                type="button"
                onClick={() => onSelect(s.key ?? s.name)}
                className="focus-ring pill hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {s.name}
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
