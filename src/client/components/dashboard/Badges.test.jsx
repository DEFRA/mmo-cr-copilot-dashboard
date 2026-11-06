import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { reducedMotion } from '#/test-helpers/motion.js'
import {
  AdminOnlyTag,
  ClassificationBadge,
  ComplexityChip,
  JiraStatusTag,
  SonarRating
} from './Badges.jsx'
import {
  LiveStreamControls,
  useLiveStreamPaused
} from './LiveStreamControls.jsx'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('#ClassificationBadge', () => {
  test.each([
    ['copilot', false, 'Copilot'],
    ['Copilot-assisted', true, 'Copilot-assisted'],
    ['human', false, 'Human'],
    ['Human-authored', true, 'Human-authored']
  ])('Should label %s in text', (classification, long, text) => {
    const { container } = render(
      <ClassificationBadge classification={classification} long={long} />
    )

    expect(container).toHaveTextContent(text)
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  test('Should style human work distinctly from Copilot work', () => {
    render(
      <>
        <ClassificationBadge classification="Human-authored" />
        <ClassificationBadge classification="Copilot-assisted" />
      </>
    )

    expect(screen.getByText('Human')).toHaveClass('app-badge--human')
    expect(screen.getByText('Copilot')).toHaveClass('app-badge--copilot')
  })
})

describe('#ComplexityChip', () => {
  test('Should show the band and score with a hidden prefix', () => {
    const { container } = render(<ComplexityChip band="XL" score={91} />)

    expect(container.firstChild).toHaveClass('app-size', 'app-size--xl')
    expect(container).toHaveTextContent('Complexity XL · 91')
  })

  test('Should fall back to M and omit a missing score', () => {
    const { container } = render(<ComplexityChip band="huge" />)

    expect(container.firstChild).toHaveClass('app-size--m')
    expect(container).toHaveTextContent('Complexity M')
    expect(container).not.toHaveTextContent('·')
  })
})

describe('#SonarRating', () => {
  test('Should show the letter and label, read as one phrase', () => {
    const { container } = render(<SonarRating rating="B" label="Security" />)

    expect(container.querySelector('.app-rating')).toHaveClass('app-rating--b')
    expect(container.querySelector('.govuk-visually-hidden')).toHaveTextContent(
      'Security rating B'
    )
  })

  test('Should say when a rating is not available', () => {
    const { container } = render(<SonarRating label="Reliability" />)

    expect(container.querySelector('.app-rating')).toHaveClass(
      'app-rating--none'
    )
    expect(container).toHaveTextContent('Reliability rating not available')
  })
})

describe('#JiraStatusTag', () => {
  test.each([
    ['Done', 'govuk-tag--green'],
    ['In progress', 'govuk-tag--purple'],
    ['To do', 'govuk-tag--grey'],
    ['Blocked', 'govuk-tag--grey']
  ])('Should colour %s with %s', (status, colour) => {
    render(<JiraStatusTag status={status} />)

    expect(screen.getByText(status)).toHaveClass('govuk-tag', colour)
  })

  test('Should use the default blue tag for In review', () => {
    render(<JiraStatusTag status="In review" />)

    expect(screen.getByText('In review').className).toBe('govuk-tag')
  })

  test('Should say Unknown when there is no status', () => {
    render(<JiraStatusTag />)

    expect(screen.getByText('Unknown')).toHaveClass('govuk-tag--grey')
  })
})

describe('#AdminOnlyTag', () => {
  test('Should render a grey Admin only tag', () => {
    render(<AdminOnlyTag />)

    expect(screen.getByText('Admin only')).toHaveClass('govuk-tag--grey')
  })
})

describe('#LiveStreamControls', () => {
  test('Should offer to pause while playing, without aria-pressed', async () => {
    const onToggle = vi.fn()
    const { container } = render(
      <LiveStreamControls paused={false} onToggle={onToggle} />
    )

    const button = screen.getByRole('button', { name: 'Pause animation' })
    expect(button).not.toHaveAttribute('aria-pressed')
    expect(container).toHaveTextContent('Live')
    expect(container.firstChild).not.toHaveClass('app-live--paused')

    button.focus()
    await userEvent.keyboard(' ')
    expect(onToggle).toHaveBeenCalledOnce()
  })

  test('Should offer to resume while paused', () => {
    const { container } = render(
      <LiveStreamControls paused onToggle={() => {}} />
    )

    expect(
      screen.getByRole('button', { name: 'Resume animation' })
    ).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('app-live--paused')
    expect(container).toHaveTextContent('Paused')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <LiveStreamControls paused={false} onToggle={() => {}} />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#useLiveStreamPaused', () => {
  test('Should play by default and toggle', () => {
    const { result } = renderHook(() => useLiveStreamPaused())

    expect(result.current[0]).toBe(false)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
  })

  test('Should start paused under reduced motion and still resume', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      reducedMotion(true).matchMedia
    )
    const { result } = renderHook(() => useLiveStreamPaused())

    expect(result.current[0]).toBe(true)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)
  })
})
