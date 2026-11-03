import { renderHook, waitFor } from '@testing-library/react'

import { selectDeliveryTrend } from '../lib/selectors.js'
import { useDeliveryTrend } from './useDeliveryTrend.js'

const SPRINTS = [
  {
    label: 'S7',
    start: new Date('2026-09-30T00:00:00.000Z'),
    end: new Date('2026-10-14T00:00:00.000Z')
  },
  {
    label: 'S6',
    start: new Date('2026-09-16T00:00:00.000Z'),
    end: new Date('2026-09-30T00:00:00.000Z')
  }
]

describe('#selectDeliveryTrend', () => {
  test('Should order sprints oldest first and null missing values', () => {
    expect(
      selectDeliveryTrend(
        [{ storiesDelivered: 5, sprintPredictability: 80 }, {}],
        SPRINTS
      )
    ).toEqual([
      {
        label: 'S6',
        delivered: null,
        predictability: null,
        changeFailRate: null,
        changeLeadTimeDays: null
      },
      {
        label: 'S7',
        delivered: 5,
        predictability: 80,
        changeFailRate: null,
        changeLeadTimeDays: null
      }
    ])
  })
})

describe('#useDeliveryTrend', () => {
  test('Should fetch each sprint window once', async () => {
    fetchMock.mockResponses(
      JSON.stringify({ storiesDelivered: 5, changeFailRate: 40 }),
      JSON.stringify({ storiesDelivered: 4, changeFailRate: 0 })
    )

    const { result } = renderHook(() => useDeliveryTrend('mmo', SPRINTS))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/projects/mmo/delivery-metrics?from=2026-09-30T00%3A00%3A00.000Z&to=2026-10-14T00%3A00%3A00.000Z',
      '/api/projects/mmo/delivery-metrics?from=2026-09-16T00%3A00%3A00.000Z&to=2026-09-30T00%3A00%3A00.000Z'
    ])
    expect(result.current.points.map((p) => p.delivered)).toEqual([4, 5])
  })

  test('Should stay idle without a project', () => {
    const { result } = renderHook(() => useDeliveryTrend(null, SPRINTS))

    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should report an error when a sprint request fails', async () => {
    fetchMock.mockResponse('', { status: 503 })

    const { result } = renderHook(() => useDeliveryTrend('mmo', SPRINTS))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.points).toEqual([])
  })
})
