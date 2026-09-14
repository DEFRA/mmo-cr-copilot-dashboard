import { renderHook, waitFor } from '@testing-library/react'

import { useSonarMetrics } from './useSonarMetrics.js'

const PATH = '/api/sonar/repo?repository=DEFRA%2Frepo-one'

describe('#useSonarMetrics', () => {
  test('Should stay idle without a path', () => {
    const { result } = renderHook(() => useSonarMetrics(null))

    expect(result.current).toEqual({ data: null, status: 'idle', error: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should fetch through the same-origin proxy', async () => {
    fetchMock.mockResponse(JSON.stringify({ configured: true }))

    const { result } = renderHook(() => useSonarMetrics(PATH))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMock.mock.calls[0][0]).toBe(PATH)
    expect(result.current.data).toEqual({ configured: true })
  })

  test('Should surface a failing status code as an error', async () => {
    fetchMock.mockResponse('', { status: 502 })

    const { result } = renderHook(() => useSonarMetrics(PATH))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toContain('502')
    expect(result.current.data).toBeNull()
  })

  test('Should surface a network failure as an error', async () => {
    fetchMock.mockReject(new Error('offline'))

    const { result } = renderHook(() => useSonarMetrics(PATH))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('offline')
  })

  test('Should refetch when the path changes', async () => {
    fetchMock.mockResponse(JSON.stringify({ configured: true }))

    const { result, rerender } = renderHook(
      ({ path }) => useSonarMetrics(path),
      {
        initialProps: { path: PATH }
      }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ path: '/api/sonar/overview' })

    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/sonar/overview')
  })

  test('Should return to idle when the path is removed', async () => {
    fetchMock.mockResponse(JSON.stringify({ configured: true }))

    const { result, rerender } = renderHook(
      ({ path }) => useSonarMetrics(path),
      {
        initialProps: { path: PATH }
      }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ path: null })

    expect(result.current.status).toBe('idle')
  })

  test('Should abort the in-flight request on unmount', async () => {
    fetchMock.mockResponse(JSON.stringify({ configured: true }))

    const { unmount } = renderHook(() => useSonarMetrics(PATH))
    unmount()

    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })
})
