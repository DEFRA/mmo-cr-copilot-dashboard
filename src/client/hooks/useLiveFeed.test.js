import { renderHook, waitFor, act } from '@testing-library/react'

import { buildPayload } from '#/test-helpers/payload-fixture.js'
import { useLiveFeed, isValidPayload, collectPayloads } from './useLiveFeed.js'

const options = { pollIntervalMs: 50 }

const respondWith = (payloads) =>
  fetchMock.mockResponse(JSON.stringify({ payloads }))

describe('#isValidPayload', () => {
  test('Should accept a well formed payload', () => {
    expect(isValidPayload(buildPayload())).toBe(true)
  })

  test.each([
    ['null', null],
    ['a string', 'payload'],
    ['a missing prNumber', buildPayload({ prNumber: undefined })],
    ['a zero prNumber', buildPayload({ prNumber: 0 })],
    ['an empty repository', buildPayload({ repository: '' })],
    ['a missing summary', buildPayload({ summary: null })],
    ['a non-array commitBreakdown', buildPayload({ commitBreakdown: {} })],
    [
      'a non-array contributorBreakdown',
      buildPayload({ contributorBreakdown: null })
    ],
    [
      'a non-numeric rate',
      buildPayload({
        summary: { copilotAssistedRate: 'high', totalCommits: 1 }
      })
    ]
  ])('Should reject %s', (_label, value) => {
    expect(isValidPayload(value)).toBe(false)
  })
})

describe('#collectPayloads', () => {
  test('Should return null for a malformed body', () => {
    expect(collectPayloads({})).toBeNull()
    expect(collectPayloads(null)).toBeNull()
    expect(collectPayloads({ payloads: 'nope' })).toBeNull()
  })

  test('Should drop invalid entries rather than rendering them', () => {
    expect(
      collectPayloads({ payloads: [buildPayload(), null, 42] })
    ).toHaveLength(1)
  })

  test('Should keep only the newest analysis per repository and PR', () => {
    const collected = collectPayloads({
      payloads: [
        buildPayload({ buildId: 'old' }),
        buildPayload({
          buildId: 'new',
          calculatedAt: '2026-01-16T10:00:00.000Z'
        })
      ]
    })

    expect(collected).toHaveLength(1)
    expect(collected[0].buildId).toBe('new')
  })

  test('Should keep payloads for different PRs separate', () => {
    const collected = collectPayloads({
      payloads: [buildPayload(), buildPayload({ prNumber: 43 })]
    })

    expect(collected).toHaveLength(2)
  })
})

describe('#useLiveFeed', () => {
  test('Should start in the connecting state', () => {
    respondWith([])

    const { result } = renderHook(() => useLiveFeed(options))

    expect(result.current.status).toBe('connecting')
    expect(result.current.payloads).toEqual([])
  })

  test('Should load payloads and report the feed as open', async () => {
    respondWith([buildPayload()])

    const { result } = renderHook(() => useLiveFeed(options))

    await waitFor(() => expect(result.current.status).toBe('open'))
    expect(result.current.payloads).toHaveLength(1)
    expect(result.current.lastMessageAt).toBeInstanceOf(Date)
  })

  test('Should poll the proxied backend endpoint', async () => {
    respondWith([])

    const { result } = renderHook(() => useLiveFeed(options))

    await waitFor(() => expect(result.current.status).toBe('open'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/payloads')
  })

  test('Should keep polling on the configured interval', async () => {
    respondWith([])

    renderHook(() => useLiveFeed(options))

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2))
  })

  test('Should report an error when the first poll fails', async () => {
    fetchMock.mockReject(new Error('offline'))

    const { result } = renderHook(() => useLiveFeed(options))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.payloads).toEqual([])
  })

  test('Should report an error for a failing status code', async () => {
    fetchMock.mockResponse('', { status: 502 })

    const { result } = renderHook(() => useLiveFeed(options))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  test('Should report an error for a malformed response body', async () => {
    fetchMock.mockResponse(JSON.stringify({ unexpected: true }))

    const { result } = renderHook(() => useLiveFeed(options))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  test('Should reconnect and keep the last known data after a later failure', async () => {
    respondWith([buildPayload()])

    const { result } = renderHook(() => useLiveFeed(options))
    await waitFor(() => expect(result.current.status).toBe('open'))

    fetchMock.mockReject(new Error('offline'))

    await waitFor(() => expect(result.current.status).toBe('reconnecting'))
    expect(result.current.payloads).toHaveLength(1)
  })

  test('Should recover once the backend returns', async () => {
    fetchMock.mockReject(new Error('offline'))

    const { result } = renderHook(() => useLiveFeed(options))
    await waitFor(() => expect(result.current.status).toBe('error'))

    respondWith([buildPayload()])

    // The first failure schedules the retry behind the backoff, not the poll interval.
    await waitFor(() => expect(result.current.status).toBe('open'), {
      timeout: 5000
    })
    expect(result.current.payloads).toHaveLength(1)
  })

  test('Should stop polling once unmounted', async () => {
    respondWith([])

    const { result, unmount } = renderHook(() => useLiveFeed(options))
    await waitFor(() => expect(result.current.status).toBe('open'))

    await act(async () => {
      unmount()
    })

    const callsAfterUnmount = fetchMock.mock.calls.length
    await new Promise((resolve) =>
      setTimeout(resolve, options.pollIntervalMs * 3)
    )

    expect(fetchMock.mock.calls.length).toBe(callsAfterUnmount)
  })

  describe('#applyPayload', () => {
    test('Should replace the PR it belongs to without touching the others', async () => {
      respondWith([buildPayload(), buildPayload({ prNumber: 43 })])

      const { result } = renderHook(() => useLiveFeed(options))
      await waitFor(() => expect(result.current.payloads).toHaveLength(2))

      act(() => {
        result.current.applyPayload(buildPayload({ buildId: 'corrected' }))
      })

      expect(result.current.payloads).toHaveLength(2)
      expect(
        result.current.payloads.find((p) => p.prNumber === 42).buildId
      ).toBe('corrected')
    })

    test('Should ignore a malformed payload', async () => {
      respondWith([buildPayload()])

      const { result } = renderHook(() => useLiveFeed(options))
      await waitFor(() => expect(result.current.payloads).toHaveLength(1))

      act(() => {
        result.current.applyPayload({ nonsense: true })
      })

      expect(result.current.payloads).toHaveLength(1)
    })
  })
})
