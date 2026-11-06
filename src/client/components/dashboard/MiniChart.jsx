import { useId } from 'react'

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js'
import { cx } from '../govuk/utils.js'

// The load animations are CSS; omitting the class keeps reduced motion still even without the media query.
const useAnimate = () => !usePrefersReducedMotion()

const svgProps = (width, height, className) => ({
  'aria-hidden': 'true',
  focusable: 'false',
  className: cx('app-mini', className),
  width,
  height,
  viewBox: `0 0 ${width} ${height}`
})

/** Decorative trend line; the value it summarises is always in text nearby. */
export function Sparkline({ data, width = 120, height = 44, className }) {
  const animate = useAnimate()
  const gradientId = `spark${useId().replace(/[^\w-]/g, '')}`
  if (!data?.length) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const last = data.length - 1
  const x = (i) => 2 + (i * (width - 8)) / (last || 1)
  const y = (v) => height - 4 - ((v - min) / (max - min || 1)) * (height - 10)
  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)

  return (
    <svg {...svgProps(width, height, className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="app-mini__stop" stopOpacity="0.35" />
          <stop offset="1" className="app-mini__stop" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className={cx(animate && 'app-anim-fade')}
        d={`M${points.join('L')}L${x(last)},${height}L${x(0)},${height}Z`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        className={cx('app-mini__line', animate && 'app-anim-draw')}
        pathLength="1"
        points={points.join(' ')}
      />
      <circle
        className={cx('app-mini__dot', animate && 'app-anim-dot')}
        cx={x(last)}
        cy={y(data[last])}
        r="4"
      />
    </svg>
  )
}

/** Decorative percentage ring, swept clockwise from 12 o'clock. */
export function ProgressRing({ value, size = 64, className }) {
  const animate = useAnimate()
  const percent = Math.min(100, Math.max(0, Number(value) || 0))
  const centre = size / 2
  const radius = centre - 6

  return (
    <svg {...svgProps(size, size, className)}>
      <circle className="app-mini__track" cx={centre} cy={centre} r={radius} />
      <circle
        className={cx('app-mini__arc', animate && 'app-anim-sweep')}
        style={{ '--len': percent }}
        pathLength="100"
        cx={centre}
        cy={centre}
        r={radius}
        strokeDasharray={`${percent} 100`}
        transform={`rotate(-90 ${centre} ${centre})`}
      />
    </svg>
  )
}

/** Decorative bar series; the latest bar is solid, earlier bars are faded. */
export function MiniBars({ data, width = 110, height = 44, className }) {
  const animate = useAnimate()
  if (!data?.length) return null

  const max = Math.max(...data, 0) || 1
  const barWidth = (width - (data.length - 1) * 4) / data.length

  return (
    <svg {...svgProps(width, height, className)}>
      {data.map((v, i) => {
        const barHeight = Math.max(3, (Math.max(0, v) / max) * (height - 2))
        return (
          <rect
            // Bars are positional; index is the identity.
            key={i}
            className={cx(
              'app-mini__bar',
              i === data.length - 1 && 'app-mini__bar--current',
              animate && 'app-anim-grow'
            )}
            style={{ '--i': i }}
            x={i * (barWidth + 4)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx="2"
          />
        )
      })}
    </svg>
  )
}
