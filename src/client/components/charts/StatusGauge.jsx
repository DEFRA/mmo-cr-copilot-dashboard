import { useMemo } from 'react'
import { Chart } from './Chart'
import { getAppPalette } from '../../lib/palette'
import { textStyle } from '../../lib/chart-style'

/**
 * Radial gauge for a 0–100 rate. Status is conveyed by the numeric readout,
 * not colour alone. Design rules allow gauges only as decorative KPI minis.
 */
export function StatusGauge({ value, title, height = 260 }) {
  const option = useMemo(() => {
    const p = getAppPalette()
    return {
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          radius: '96%',
          center: ['50%', '62%'],
          progress: {
            show: true,
            width: 16,
            roundCap: true,
            itemStyle: { color: p.copilot }
          },
          axisLine: {
            roundCap: true,
            lineStyle: { width: 16, color: [[1, p.neutral]] }
          },
          pointer: {
            show: true,
            length: '62%',
            width: 4,
            itemStyle: { color: p.text }
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 10,
            itemStyle: { color: p.text }
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: textStyle(p, { offsetCenter: [0, '50%'], color: p.muted }),
          detail: textStyle(p, {
            valueAnimation: true,
            offsetCenter: [0, '24%'],
            formatter: (v) => `${v.toFixed(1)}%`,
            fontSize: 26,
            fontWeight: 'bold'
          }),
          data: [{ value, name: title }]
        }
      ]
    }
  }, [value, title])

  return (
    <Chart
      option={option}
      height={height}
      ariaLabel={`${title}: ${value.toFixed(1)} percent`}
      dataTable={`${title} is ${value.toFixed(1)}%.`}
    />
  )
}
