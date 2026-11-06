import { act, renderHook } from '@testing-library/react'

import { reducedMotion } from '#/test-helpers/motion.js'
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('#usePrefersReducedMotion', () => {
  test('Should be false when the user has no motion preference', () => {
    const { result } = renderHook(() => usePrefersReducedMotion())

    expect(result.current).toBe(false)
  })

  test('Should follow the preference as it changes and unsubscribe', () => {
    const motion = reducedMotion(true)
    vi.spyOn(window, 'matchMedia').mockImplementation(motion.matchMedia)

    const { result, unmount } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)

    act(() => motion.set(false))
    expect(result.current).toBe(false)

    unmount()
    expect(motion.listeners.size).toBe(0)
  })
})
