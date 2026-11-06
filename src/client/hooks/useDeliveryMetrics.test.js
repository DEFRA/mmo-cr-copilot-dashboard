import { renderHook, waitFor } from '@testing-library/react'

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
})
