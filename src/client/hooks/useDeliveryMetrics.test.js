import { act, renderHook, waitFor } from '@testing-library/react'

import { useDeliveryMetrics } from './useDeliveryMetrics.js'

const WINDOW = {
  start: new Date('2026-10-14T00:00:00.000Z'),
  end: new Date('2026-10-28T00:00:00.000Z')
}

describe('#useDeliveryMetrics', () => {
  test('Should fetch the window metrics and the project tickets', async () => {
    fetchMock.mockResponses(
      JSON.stringify({ storiesDelivered: 3, warnings: [] }),
      JSON.stringify({ issues: [{ key: 'MMO-1' }] })
    )

    const { result } = renderHook(() => useDeliveryMetrics('mmo', WINDOW))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/projects/mmo/delivery-metrics?from=2026-10-14T00%3A00%3A00.000Z&to=2026-10-28T00%3A00%3A00.000Z',
      '/api/projects/mmo/jira-issues'
    ])
    expect(result.current.metrics.storiesDelivered).toBe(3)
    expect(result.current.issues).toEqual([{ key: 'MMO-1' }])
  })

  test('Should stay idle without a project', () => {
    const { result } = renderHook(() => useDeliveryMetrics(null, WINDOW))

    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should report an error when a request fails', async () => {
    fetchMock.mockResponse('', { status: 503 })

    const { result } = renderHook(() => useDeliveryMetrics('mmo', WINDOW))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.metrics).toBeNull()
  })

  describe('Pending Jira refresh', () => {
    const metricsCalls = () =>
      fetchMock.mock.calls.filter(([url]) => url.includes('/delivery-metrics'))
    const serve = (metrics) =>
      fetchMock.mockResponse(async (req) =>
        req.url.includes('/delivery-metrics')
          ? JSON.stringify(metrics())
          : JSON.stringify({ issues: [] })
      )
    const tick = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('Should ask again after 10, 20 and 40 seconds and then stop', async () => {
      serve(() => ({ jira: { pending: true } }))
      const { result } = renderHook(() => useDeliveryMetrics('mmo', WINDOW))

      await tick(0)
      expect(result.current.status).toBe('success')
      expect(metricsCalls()).toHaveLength(1)

      await tick(9_999)
      expect(metricsCalls()).toHaveLength(1)
      await tick(1)
      expect(metricsCalls()).toHaveLength(2)

      await tick(20_000)
      expect(metricsCalls()).toHaveLength(3)
      await tick(40_000)
      expect(metricsCalls()).toHaveLength(4)

      await tick(600_000)
      expect(metricsCalls()).toHaveLength(4)
      expect(result.current.status).toBe('success')
    })

    test('Should keep the data on screen while it asks again, and show the refreshed data', async () => {
      let pending = true
      serve(() => ({ storiesDelivered: pending ? 1 : 2, jira: { pending } }))
      const { result } = renderHook(() => useDeliveryMetrics('mmo', WINDOW))
      await tick(0)

      pending = false
      await tick(10_000)

      expect(result.current.status).toBe('success')
      expect(result.current.metrics).toMatchObject({ storiesDelivered: 2 })
      await tick(600_000)
      expect(metricsCalls()).toHaveLength(2)
    })

    test('Should not ask again when Jira is not pending', async () => {
      serve(() => ({ jira: { pending: false } }))
      renderHook(() => useDeliveryMetrics('mmo', WINDOW))

      await tick(600_000)

      expect(metricsCalls()).toHaveLength(1)
    })

    test('Should keep the last data and stop when a repeat request fails', async () => {
      let fail = false
      fetchMock.mockResponse(async (req) => {
        if (fail) return { status: 503, body: '' }
        return req.url.includes('/delivery-metrics')
          ? JSON.stringify({ storiesDelivered: 1, jira: { pending: true } })
          : JSON.stringify({ issues: [] })
      })
      const { result } = renderHook(() => useDeliveryMetrics('mmo', WINDOW))
      await tick(0)

      fail = true
      await tick(10_000)

      expect(result.current.status).toBe('success')
      expect(result.current.metrics).toMatchObject({ storiesDelivered: 1 })
      await tick(600_000)
      expect(metricsCalls()).toHaveLength(2)
    })

    test('Should clear the timer on unmount', async () => {
      serve(() => ({ jira: { pending: true } }))
      const { unmount } = renderHook(() => useDeliveryMetrics('mmo', WINDOW))
      await tick(0)

      unmount()
      await tick(600_000)

      expect(metricsCalls()).toHaveLength(1)
    })
  })
})
