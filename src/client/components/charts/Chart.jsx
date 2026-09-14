import { useEffect, useMemo, useRef } from 'react'
// The ESM build, not `lib/core`: that one is CJS and resolves to a namespace
// object rather than the component.
import ReactECharts from 'echarts-for-react/esm/core'
import echarts from '../../lib/echarts'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Base chart wrapper. Merges shared animation/tooltip defaults, resizes via a
 * single ResizeObserver, and renders an accessible <figure> with a summarising
 * label plus an optional visually-hidden data-table alternative.
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

  const mergedOption = useMemo(() => {
    const animate = !prefersReducedMotion()
    return {
      animation: animate,
      animationDuration: animate ? 600 : 0,
      animationDurationUpdate: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      textStyle: { fontFamily: 'var(--font-sans)' },
      ...option
    }
  }, [option])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance().resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <figure
      ref={containerRef}
      className={`m-0 ${className}`}
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
        opts={{ renderer: 'canvas' }}
      />
      {dataTable ? <div className="visually-hidden">{dataTable}</div> : null}
    </figure>
  )
}
