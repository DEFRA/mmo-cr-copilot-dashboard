import { render, screen } from '@testing-library/react'

import { reducedMotion } from '#/test-helpers/motion.js'
import { Icon, ICON_NAMES } from './Icon.jsx'
import { MiniBars, ProgressRing, Sparkline } from './MiniChart.jsx'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('#Icon', () => {
  test.each(ICON_NAMES)(
    'Should hide the %s icon from assistive tech',
    (name) => {
      const { container } = render(<Icon name={name} size={18} />)
      const svg = container.querySelector('svg')

      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('focusable', 'false')
      expect(svg).toHaveAttribute('width', '18')
      expect(svg.childElementCount).toBeGreaterThan(0)
    }
  )
})

describe('#Sparkline', () => {
  test('Should draw a decorative animated line, area and end dot', () => {
    const { container } = render(<Sparkline data={[1, 3, 2, 5]} />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelector('polyline')).toHaveClass('app-anim-draw')
    expect(svg.querySelector('path')).toHaveClass('app-anim-fade')
    expect(svg.querySelector('circle')).toHaveClass('app-anim-dot')
    expect(svg.querySelector('path').getAttribute('fill')).toMatch(
      /^url\(#spark[\w-]+\)$/
    )
  })

  test('Should cope with a flat or single-point series', () => {
    const { container } = render(<Sparkline data={[4]} />)

    expect(container.querySelector('polyline')).toHaveAttribute(
      'points',
      '2.0,40.0'
    )
  })

  test('Should render nothing without data', () => {
    const { container } = render(<Sparkline data={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  test('Should not animate when the user prefers reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      reducedMotion(true).matchMedia
    )
    const { container } = render(<Sparkline data={[1, 2]} />)

    expect(container.querySelector('[class*="app-anim"]')).toBeNull()
  })
})

describe('#ProgressRing', () => {
  test('Should sweep to the value, clamped to 0–100', () => {
    const { container, rerender } = render(<ProgressRing value={72} />)
    const arc = () => container.querySelectorAll('circle')[1]

    expect(arc()).toHaveAttribute('stroke-dasharray', '72 100')
    expect(arc()).toHaveClass('app-anim-sweep')

    rerender(<ProgressRing value={140} />)
    expect(arc()).toHaveAttribute('stroke-dasharray', '100 100')

    rerender(<ProgressRing value="n/a" />)
    expect(arc()).toHaveAttribute('stroke-dasharray', '0 100')
  })

  test('Should not animate when the user prefers reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      reducedMotion(true).matchMedia
    )
    const { container } = render(<ProgressRing value={50} />)

    expect(container.querySelectorAll('circle')[1]).not.toHaveClass(
      'app-anim-sweep'
    )
  })
})

describe('#MiniBars', () => {
  test('Should draw one bar per value and highlight the latest', () => {
    const { container } = render(<MiniBars data={[2, 0, -1, 4]} />)
    const bars = container.querySelectorAll('rect')

    expect(bars).toHaveLength(4)
    expect(bars[3]).toHaveClass('app-mini__bar--current', 'app-anim-grow')
    expect(bars[0]).not.toHaveClass('app-mini__bar--current')
    expect(Number(bars[2].getAttribute('height'))).toBe(3)
  })

  test('Should render nothing without data', () => {
    const { container } = render(<MiniBars />)

    expect(container).toBeEmptyDOMElement()
  })

  test('Should not animate when the user prefers reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      reducedMotion(true).matchMedia
    )
    const { container } = render(<MiniBars data={[1, 2]} />)

    expect(container.querySelector('.app-anim-grow')).toBeNull()
  })

  test('Should keep every mini chart out of the accessibility tree', () => {
    render(
      <>
        <Sparkline data={[1, 2]} />
        <ProgressRing value={1} />
        <MiniBars data={[1]} />
      </>
    )

    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})
