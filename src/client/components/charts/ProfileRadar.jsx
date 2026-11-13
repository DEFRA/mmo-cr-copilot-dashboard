import { useMemo, useState } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import {
  LINE_TYPES,
  SYMBOLS,
  escapeHtml,
  textStyle,
  tooltip
} from '../../lib/chart-style'

/**
 * Radar / profile chart. Each series is a polygon across the shared indicator
 * axes (all normalised 0–100, higher = better), told apart by colour, dash and
 * marker. Optional `onSelect` makes each series a drill-down; a
 * keyboard-navigable fallback list mirrors it.
 */
export function ProfileRadar({
  indicators,
  series,
  title,
  subtitle,
  height = 380,
  onSelect
}) {
  const [hidden, setHidden] = useState(() => new Set())
  const p = getAppPalette()
  const colorAt = (i) => p.categorical[i % p.categorical.length]
  const keyOf = (s) => s.key ?? s.name

  const toggle = (key) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })

  const option = useMemo(() => {
    return {
      tooltip: tooltip(p, {
        formatter: (params) => {
          const rows = indicators
            .map(
              (ind, i) => `${escapeHtml(ind.name)}: <b>${params.value[i]}</b>`
            )
            .join('<br/>')
          return `<b>${escapeHtml(params.name)}</b><br/>${rows}`
        }
      }),
      legend: { show: false },
      radar: {
        indicator: indicators,
        radius: '60%',
        center: ['50%', '52%'],
        splitNumber: 4,
        axisName: textStyle(p),
        axisLine: { lineStyle: { color: p.grid } },
        splitLine: { lineStyle: { color: p.grid } },
        splitArea: { show: false }
      },
      series: [
        {
          type: 'radar',
          emphasis: { areaStyle: { opacity: 0.3 }, lineStyle: { width: 3 } },
          // Each polygon keeps the colour of its original position when others are hidden.
          data: series
            .filter((s) => !hidden.has(keyOf(s)))
            .map((s) => {
              const i = series.indexOf(s)
              return {
                name: s.name,
                value: s.values,
                symbol: SYMBOLS[i % SYMBOLS.length],
                symbolSize: 7,
                lineStyle: {
                  width: 2,
                  color: colorAt(i),
                  type: LINE_TYPES[i % LINE_TYPES.length]
                },
                itemStyle: { color: colorAt(i) },
                areaStyle: { color: colorAt(i), opacity: 0.1 }
              }
            })
        }
      ]
    }
    // The palette follows the theme, which re-renders this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators, series, hidden])

  const handleEvents = useMemo(
    () =>
      onSelect
        ? {
            click: (params) => {
              const match = series.find((s) => s.name === params.name)
              if (match) {
                onSelect(match.key ?? match.name)
              }
            }
          }
        : undefined,
    [onSelect, series]
  )

  return (
    <div className="app-radar">
      <div className="app-radar__chart">
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
      </div>
      <ul className="app-radar__legend" aria-label="Repositories in this chart">
        {series.map((s, i) => {
          const key = keyOf(s)
          const shown = !hidden.has(key)
          return (
            <li key={key}>
              <button
                type="button"
                className="app-radar__item"
                aria-pressed={shown}
                onClick={() => toggle(key)}
              >
                <span
                  className="app-radar__swatch"
                  style={{
                    '--swatch': colorAt(i),
                    borderTopStyle:
                      LINE_TYPES[i % LINE_TYPES.length] === 'solid'
                        ? 'solid'
                        : 'dashed'
                  }}
                  aria-hidden="true"
                />
                <span className="app-radar__name" title={s.name}>
                  {s.name}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
