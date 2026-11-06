import { useContext, useEffect, useMemo, useRef } from 'react'
// The ESM build, not `lib/core`: that one is CJS and resolves to a namespace
// object rather than the component.
import ReactECharts from 'echarts-for-react/esm/core'
import echarts from '../../lib/echarts'
import { CHART_FONT } from '../../lib/chart-style'
import { getMotionDuration } from '../../lib/palette'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { InChartFigureContext } from './chart-context'

/**
 * Base chart wrapper. Merges shared animation, font and aria defaults, resizes
 * via a single ResizeObserver, and labels the canvas; outside a ChartFigure it
 * adds a visually-hidden data-table alternative.
 */
export function Chart({
  option,
  height = 320,
  ariaLabel,
  dataTable = null,
  onEvents,
  className = ''
}) {
  const chartRef = useRef(null)
  const containerRef = useRef(null)
  const reducedMotion = usePrefersReducedMotion()
  const inFigure = useContext(InChartFigureContext)

  const mergedOption = useMemo(() => {
    const animate = !reducedMotion
    const duration = animate ? getMotionDuration() : 0
    return {
      animation: animate,
      animationDuration: duration,
      animationDurationUpdate: animate ? duration / 2 : 0,
      animationEasing: 'quinticOut',
      textStyle: { fontFamily: CHART_FONT },
      aria: { enabled: true, label: { description: ariaLabel } },
      ...option
    }
  }, [option, reducedMotion, ariaLabel])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance().resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // role="img" hides its children from assistive tech, so it wraps the canvas only.
  return (
    <div className={className || undefined}>
      <div
        ref={containerRef}
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        <ReactECharts
          ref={chartRef}
          echarts={echarts}
          option={mergedOption}
          onEvents={onEvents}
          notMerge={false}
          lazyUpdate
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
      </div>
      {dataTable && !inFigure ? (
        <div className="govuk-visually-hidden">{dataTable}</div>
      ) : null}
    </div>
  )
}
