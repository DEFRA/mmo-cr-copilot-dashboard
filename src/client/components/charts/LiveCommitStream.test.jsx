import { act, render, screen } from '@testing-library/react'

import { reducedMotion } from '#/test-helpers/motion.js'
import { HOLD_MS, LiveCommitStream, REVEAL_MS } from './LiveCommitStream.jsx'

const commit = (n, overrides = {}) => ({
  commit: `sha000${n}`,
  author: 'ada',
  subject: `Commit number ${n}`,
  classification: n % 2 ? 'Copilot-assisted' : 'Human-authored',
  committedAt: `2026-01-1${n}T09:00:00.000Z`,
  repository: 'DEFRA/repo-a',
  repoName: 'repo-a',
  prNumber: 42,
  linesTouched: 10 * n,
  linesAdded: 8 * n,
  linesDeleted: 2 * n,
  ...overrides
})

const timeline = [commit(1), commit(2), commit(3)]

const status = () => screen.getByRole('status').textContent

describe('#LiveCommitStream', () => {
  let originalMatchMedia

  beforeEach(() => {
    vi.useFakeTimers()
    originalMatchMedia = window.matchMedia
    window.matchMedia = reducedMotion(false).matchMedia
  })

  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = originalMatchMedia
  })

  test('Should reveal one commit at a time', () => {
    render(<LiveCommitStream timeline={timeline} />)

    expect(status()).toContain('sha0001')

    act(() => vi.advanceTimersByTime(REVEAL_MS))
    expect(status()).toContain('sha0002')

    act(() => vi.advanceTimersByTime(REVEAL_MS))
    expect(status()).toContain('sha0003')
  })

  test('Should hold on the last commit and then loop back to the first', () => {
    render(<LiveCommitStream timeline={timeline} />)
    act(() => vi.advanceTimersByTime(REVEAL_MS))
    act(() => vi.advanceTimersByTime(REVEAL_MS))
    expect(status()).toContain('sha0003')
    act(() => vi.advanceTimersByTime(HOLD_MS - 1))
    expect(status()).toContain('sha0003')

    act(() => vi.advanceTimersByTime(1))
    expect(status()).toContain('sha0001')
  })

  test('Should freeze the current frame while paused', () => {
    const { rerender } = render(<LiveCommitStream timeline={timeline} />)
    act(() => vi.advanceTimersByTime(REVEAL_MS))

    rerender(<LiveCommitStream timeline={timeline} paused />)
    act(() => vi.advanceTimersByTime(REVEAL_MS * 5))
    expect(status()).toContain('sha0002')

    rerender(<LiveCommitStream timeline={timeline} />)
    act(() => vi.advanceTimersByTime(REVEAL_MS))
    expect(status()).toContain('sha0003')
  })

  test('Should show every commit at once when the user prefers reduced motion', () => {
    window.matchMedia = reducedMotion(true).matchMedia

    render(<LiveCommitStream timeline={timeline} />)

    expect(status()).toContain('sha0003')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  test('Should list the commit messages newest first', () => {
    window.matchMedia = reducedMotion(true).matchMedia

    render(<LiveCommitStream timeline={timeline} />)

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Commit number 3')
    expect(items[0]).toHaveTextContent('ada · repo-a · PR #42 · +24 −6')
    expect(items[2]).toHaveTextContent('Commit number 1')
  })

  test('Should plot only the commits revealed so far', () => {
    render(<LiveCommitStream timeline={timeline} />)

    const option = globalThis.__chartOptions.at(-1)
    expect(option.xAxis.data).toEqual(['sha0001'])
  })
})
