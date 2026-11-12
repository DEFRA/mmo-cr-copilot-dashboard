import { act, renderHook, waitFor } from '@testing-library/react'

import { useRepositories } from './useRepositories.js'

const route = (routes) =>
  fetchMock.mockResponse(async (request) => {
    const path = new URL(request.url, 'http://localhost').pathname
    const hit = routes[path]
    if (hit === undefined) {
      throw new Error(`unexpected ${path}`)
    }
    return typeof hit === 'number'
      ? { status: hit, body: '{}' }
      : JSON.stringify(hit)
  })

describe('#useRepositories', () => {
  test('Should not fetch while disabled', () => {
    const { result } = renderHook(() => useRepositories(false))

    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should load mapped and unassigned repositories', async () => {
    route({
      '/api/repositories': { repositories: [{ fullName: 'DEFRA/a' }] },
      '/api/repositories/unassigned': { repositories: ['DEFRA/b'] }
    })

    const { result } = renderHook(() => useRepositories(true))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.repositories).toEqual([{ fullName: 'DEFRA/a' }])
    expect(result.current.unassigned).toEqual(['DEFRA/b'])
  })

  test('Should read a refused unassigned list as empty, not as an error', async () => {
    route({
      '/api/repositories': { repositories: [{ fullName: 'DEFRA/a' }] },
      '/api/repositories/unassigned': 403
    })

    const { result } = renderHook(() => useRepositories(true))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.unassigned).toEqual([])
  })

  test('Should report an error when the repository list fails', async () => {
    route({
      '/api/repositories': 500,
      '/api/repositories/unassigned': { repositories: [] }
    })

    const { result } = renderHook(() => useRepositories(true))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  test('Should tolerate malformed bodies', async () => {
    route({ '/api/repositories': {}, '/api/repositories/unassigned': {} })

    const { result } = renderHook(() => useRepositories(true))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.repositories).toEqual([])
    expect(result.current.unassigned).toEqual([])
  })

  test('Should refetch on refresh', async () => {
    route({ '/api/repositories': {}, '/api/repositories/unassigned': {} })
    const { result } = renderHook(() => useRepositories(true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    const calls = fetchMock.mock.calls.length

    act(() => result.current.refresh())

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(calls)
    )
  })
})
