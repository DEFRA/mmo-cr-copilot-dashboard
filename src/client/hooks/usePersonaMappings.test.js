import { act, renderHook, waitFor } from '@testing-library/react'

import { usePersonaMappings } from './usePersonaMappings.js'

describe('#usePersonaMappings', () => {
  test('Should fetch the mapping list on mount', async () => {
    fetchMock.mockResponse(
      JSON.stringify({
        mappings: [{ githubHandle: 'octocat', persona: 'devops' }]
      })
    )

    const { result } = renderHook(() => usePersonaMappings())

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/persona-mappings')
    expect(result.current.mappings).toEqual([
      { githubHandle: 'octocat', persona: 'devops' }
    ])
  })

  test('Should tolerate a malformed response', async () => {
    fetchMock.mockResponse(JSON.stringify({}))

    const { result } = renderHook(() => usePersonaMappings())

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.mappings).toEqual([])
  })

  test('Should surface a failing status code as an error', async () => {
    fetchMock.mockResponse('', { status: 500 })

    const { result } = renderHook(() => usePersonaMappings())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toContain('500')
  })

  test('Should add a mapping to local state on upsert', async () => {
    fetchMock.mockResponse(JSON.stringify({ mappings: [] }))

    const { result } = renderHook(() => usePersonaMappings())
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockResponse(
      JSON.stringify({ githubHandle: 'octocat', persona: 'qa' })
    )

    await act(async () => {
      await result.current.upsert('octocat', 'qa')
    })

    expect(result.current.mappings).toEqual([
      { githubHandle: 'octocat', persona: 'qa' }
    ])
  })

  test('Should reject upsert when the backend rejects the request', async () => {
    fetchMock.mockResponse(JSON.stringify({ mappings: [] }))

    const { result } = renderHook(() => usePersonaMappings())
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockResponse(JSON.stringify({ message: 'Invalid handle' }), {
      status: 400
    })

    await expect(result.current.upsert('bad handle', 'qa')).rejects.toThrow(
      'Invalid handle'
    )
  })

  test('Should remove a mapping from local state', async () => {
    fetchMock.mockResponse(
      JSON.stringify({
        mappings: [{ githubHandle: 'octocat', persona: 'devops' }]
      })
    )

    const { result } = renderHook(() => usePersonaMappings())
    await waitFor(() => expect(result.current.mappings).toHaveLength(1))

    fetchMock.mockResponse(null, { status: 204 })

    await act(async () => {
      await result.current.remove('octocat')
    })

    expect(result.current.mappings).toEqual([])
  })

  test('Should refetch when refresh is called', async () => {
    fetchMock.mockResponse(JSON.stringify({ mappings: [] }))

    const { result } = renderHook(() => usePersonaMappings())
    await waitFor(() => expect(result.current.status).toBe('success'))

    act(() => result.current.refresh())

    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
  })
})
