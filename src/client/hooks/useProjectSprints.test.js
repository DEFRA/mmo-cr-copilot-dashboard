import { renderHook, waitFor } from '@testing-library/react'

import { useProjectSprints } from './useProjectSprints.js'

describe('#useProjectSprints', () => {
  test('Should fetch the project calendar and parse the windows', async () => {
    fetchMock.mockResponse(
      JSON.stringify({
        sprints: [
          {
            index: 2,
            label: 'Sprint 2',
            start: '2026-10-14T00:00:00.000Z',
            end: '2026-10-28T00:00:00.000Z'
          },
          { index: 1, label: 'Bad', start: 'nope', end: 'nope' }
        ]
      })
    )

    const { result } = renderHook(() => useProjectSprints('mmo-cr'))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/projects/mmo-cr/sprints?count=4'
    )
    expect(result.current.sprints).toEqual([
      {
        index: 2,
        label: 'Sprint 2',
        start: new Date('2026-10-14T00:00:00.000Z'),
        end: new Date('2026-10-28T00:00:00.000Z')
      }
    ])
  })

  test('Should fall back to an empty list when the request fails', async () => {
    fetchMock.mockResponse('', { status: 500 })

    const { result } = renderHook(() => useProjectSprints('mmo-cr'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.sprints).toEqual([])
  })

  test('Should not fetch without a project', () => {
    renderHook(() => useProjectSprints(undefined))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should fetch again when the sprint period changes', async () => {
    fetchMock.mockResponse(JSON.stringify({ sprints: [] }))
    const { result, rerender } = renderHook(
      ({ revision }) => useProjectSprints('mmo-cr', 4, revision),
      { initialProps: { revision: '14|2026-07-08' } }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ revision: '7|2026-11-02' })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
