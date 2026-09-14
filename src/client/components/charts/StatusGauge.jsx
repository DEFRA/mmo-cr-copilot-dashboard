import { useMemo } from 'react'
import { Chart } from './Chart'
import { getPalette } from '../../lib/palette'

/**
 * Radial gauge for a 0–100 rate with threshold bands. Status is conveyed by the
 * numeric readout + band label, not colour alone.
 */
export function StatusGauge({ value, title, theme, height = 260 }) {
  const option = useMemo(() => {
    const p = getPalette()
    return {
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: '92%',
          center: ['50%', '58%'],
          progress: {
            show: true,
            width: 18,
            roundCap: true,
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: p.copilot },
                  { offset: 1, color: p.accent }
                ]
              }
            }
          },
          // Light, neutral track behind the progress arc (empty → 100%).
          axisLine: {
            roundCap: true,
            lineStyle: { width: 18, color: [[1, p.border]] }
          },
          // Needle: theme-aware pastel, pivoted at the centre. Sweeps from 0 to
          // the value on mount via the wrapper's series animation.
          pointer: {
            show: true,
            length: '60%',
            width: 6,
            itemStyle: {
              color: p.gaugeNeedle,
              shadowBlur: 6,
              shadowColor: 'rgba(0,0,0,0.18)'
            }
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 16,
            itemStyle: {
              color: p.gaugeNeedle,
              borderColor: p.surface,
              borderWidth: 3
            }
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: { offsetCenter: [0, '82%'], color: p.textMuted, fontSize: 12 },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, '40%'],
            formatter: (v) => `${v.toFixed(1)}%`,
            color: p.text,
            fontSize: 26,
            fontWeight: 700
          },
          data: [{ value, name: title }]
        }
      ]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, title, theme])

  return (
    <Chart
      option={option}
      height={height}
      ariaLabel={`${title}: ${value.toFixed(1)} percent`}
      dataTable={`${title} is ${value.toFixed(1)}%.`}
    />
  )
}
