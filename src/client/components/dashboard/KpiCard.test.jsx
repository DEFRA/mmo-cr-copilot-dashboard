import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { reducedMotion } from '#/test-helpers/motion.js'
import { Delta, KpiCard, titleCase } from './KpiCard.jsx'
import { Sparkline } from './MiniChart.jsx'

const reduce = () =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(reducedMotion(true).matchMedia)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('#Delta', () => {
  test.each([
    ['up', 'good', '▲', 'improved'],
    ['down', 'bad', '▼', 'worsened'],
    ['flat', 'flat', '■', 'no meaningful change']
  ])(
    'Should pair the %s arrow with hidden %s text',
    (direction, tone, arrow, words) => {
      const { container } = render(
        <Delta direction={direction} tone={tone}>
          8.3 pts vs previous sprint
        </Delta>
      )

      expect(container.firstChild).toHaveClass(`app-delta--${tone}`)
      expect(screen.getByText(arrow)).toHaveAttribute('aria-hidden', 'true')
      expect(container).toHaveTextContent(
        `8.3 pts vs previous sprint (${words})`
      )
    }
  )

  test('Should default to a flat delta', () => {
    const { container } = render(<Delta>No change</Delta>)

    expect(container).toHaveTextContent('No change (no meaningful change)')
  })
})

describe('#titleCase', () => {
  test('Should capitalise every word and keep acronyms', () => {
    expect(titleCase('net lines delivered')).toBe('Net Lines Delivered')
    expect(titleCase('PR coding cycle time')).toBe('PR Coding Cycle Time')
  })
})

describe('#KpiCard', () => {
  test('Should render its label in Title Case', () => {
    reduce()
    render(<KpiCard label="net lines delivered" value="520" />)

    expect(
      screen.getByRole('heading', { name: 'Net Lines Delivered' })
    ).toBeInTheDocument()
  })

  test('Should be an article named by its label, with value, unit and family', () => {
    reduce()
    render(
      <KpiCard
        label="Commit assist rate"
        value="62.5"
        unit="%"
        family="assist"
        icon="sparkle"
        sub="125 of 200 commits"
        delta={{ direction: 'up', tone: 'good', text: '8.3 pts' }}
        badge="Live sprint"
        chart={<Sparkline data={[1, 2]} />}
      />
    )

    const card = screen.getByRole('article', { name: 'Commit Assist Rate' })
    expect(card).toHaveClass('app-kpi', 'app-family--assist')
    expect(card).not.toHaveClass('app-kpi--action', 'app-anim-rise')
    expect(
      screen.getByRole('heading', { level: 3, name: 'Commit Assist Rate' })
    ).toBeInTheDocument()
    expect(card).toHaveTextContent('Assist')
    expect(card).toHaveTextContent('125 of 200 commits')
    expect(card).toHaveTextContent('8.3 pts (improved)')
    expect(card).toHaveTextContent('Live sprint')
    expect(card.querySelector('.app-kpi__unit')).toHaveTextContent('%')
    expect(card.querySelector('.app-kpi__viz svg')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('Should fall back to the speed family for an unknown family', () => {
    render(<KpiCard label="X" value="1" family="mystery" familyLabel="Other" />)

    expect(screen.getByRole('article')).toHaveClass('app-family--speed')
    expect(screen.getByRole('article')).toHaveTextContent('Other')
  })

  test('Should leave out the family pill when asked', () => {
    render(<KpiCard label="X" value="1" family="leverage" showFamily={false} />)

    expect(screen.getByRole('article')).not.toHaveTextContent('Leverage')
    expect(screen.getByRole('article')).toHaveClass('app-family--leverage')
  })

  test('Should become a disclosure button that controls its drill panel', async () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <KpiCard
        label="Commit assist rate"
        value="62"
        onClick={onClick}
        controls="drill"
        actionText="show breakdown by repository"
        headingLevel={2}
      />
    )

    const button = screen.getByRole('button', {
      name: 'Commit Assist Rate, show breakdown by repository'
    })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'drill')
    expect(screen.getByRole('heading', { level: 2 })).toContainElement(button)

    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <KpiCard
        label="Commit assist rate"
        value="62"
        onClick={onClick}
        expanded
      />
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('article')).toHaveClass(
      'app-kpi--action',
      'app-kpi--open'
    )
  })

  test('Should link one scope down when given an href', () => {
    render(
      <KpiCard
        label="Lines touched"
        value="1,204"
        href="#commit-log"
        actionText="view commit log"
        dimmed
      />
    )

    expect(
      screen.getByRole('link', { name: 'Lines Touched, view commit log' })
    ).toHaveAttribute('href', '#commit-log')
    expect(screen.getByRole('article')).toHaveClass('app-kpi--dimmed')
  })

  test('Should count the value up once while keeping the final value for screen readers', () => {
    const frames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')

    const { container, unmount } = render(
      <KpiCard label="Net lines" value="+1,240.5" index={2} />
    )
    const visible = container.querySelector('.app-kpi__value [aria-hidden]')

    expect(visible).toHaveTextContent('+0')
    expect(container.querySelector('.govuk-visually-hidden')).toHaveTextContent(
      '+1,240.5'
    )
    expect(screen.getByRole('article')).toHaveClass('app-anim-rise')
    expect(screen.getByRole('article')).toHaveStyle({ '--d': '160ms' })

    act(() => frames.shift()(1000))
    act(() => frames.shift()(1610))
    expect(visible.textContent).toMatch(/^\+[\d,]+\.\d$/)

    act(() => frames.shift()(5000))
    expect(visible).toHaveTextContent('+1,240.5')
    expect(frames).toHaveLength(0)

    unmount()
    expect(cancel).toHaveBeenCalled()
  })

  test('Should show a non-numeric value as it is', () => {
    render(<KpiCard label="Rating" value="n/a" />)

    expect(screen.getByRole('article')).toHaveTextContent('n/a')
  })

  test('Should not count up under reduced motion', () => {
    reduce()
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const { container } = render(<KpiCard label="PRs" value="42" />)

    expect(
      container.querySelector('.app-kpi__value [aria-hidden]')
    ).toHaveTextContent('42')
    expect(raf).not.toHaveBeenCalled()
  })

  test('Should have no axe violations', async () => {
    reduce()
    const { container } = render(
      <KpiCard
        label="Copilot adoption"
        value="8"
        unit="of 12"
        family="adoption"
        icon="users"
        onClick={() => {}}
        actionText="show breakdown"
        delta={{ direction: 'down', tone: 'bad', text: '1' }}
      />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
