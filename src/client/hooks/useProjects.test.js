import { act, renderHook, waitFor } from '@testing-library/react'

import { useProjects } from './useProjects.js'

const PROJECT_A = {
  slug: 'proj-a',
  name: 'Project A',
  type: 'ai-adopted',
  adoptionStartDate: '2026-01-01T00:00:00.000Z'
}

const PROJECT_B = {
  slug: 'proj-b',
  name: 'Project B',
  type: 'ai-native',
  adoptionStartDate: '2026-02-01T00:00:00.000Z'
}

describe('#useProjects', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.resetMocks()
  })

  test('Should load projects from a direct array response', async () => {
    fetchMock.mockResponse(JSON.stringify([PROJECT_A, PROJECT_B]))

    const { result } = renderHook(() => useProjects())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toEqual([PROJECT_A, PROJECT_B])
    expect(result.current.activeProject).toEqual(PROJECT_A)
  })

  test('Should load projects from an object response with projects array', async () => {
    fetchMock.mockResponse(JSON.stringify({ projects: [PROJECT_B, PROJECT_A] }))

    const { result } = renderHook(() => useProjects())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toEqual([PROJECT_B, PROJECT_A])
    expect(result.current.activeProject).toEqual(PROJECT_B)
  })

  test('Should report an error, and invent no project, when the request fails', async () => {
    fetchMock.mockReject(new Error('offline'))

    const { result } = renderHook(() => useProjects())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.projects).toEqual([])
    expect(result.current.activeProject).toBeNull()
  })

  test('Should report an error on a refused response', async () => {
    fetchMock.mockResponse('{}', { status: 403 })

    const { result } = renderHook(() => useProjects())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.projects).toEqual([])
  })

  test('Should treat a malformed response as no projects', async () => {
    fetchMock.mockResponse(JSON.stringify({ notProjects: [] }))

    const { result } = renderHook(() => useProjects())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toEqual([])
    expect(result.current.status).toBe('success')
    expect(result.current.activeProject).toBeNull()
  })

  test('Should keep the last projects when a refresh fails', async () => {
    fetchMock.mockResponse(JSON.stringify([PROJECT_A]))
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockReject(new Error('offline'))
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.status).toBe('success')
    expect(result.current.projects).toEqual([PROJECT_A])
  })

  test('Should ignore a remembered project the caller no longer has', async () => {
    localStorage.setItem('mmo-active-project', 'gone')
    fetchMock.mockResponse(JSON.stringify([PROJECT_A]))

    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeProject).toEqual(PROJECT_A)
  })

  test('Should switch active project and persist selection to localStorage', async () => {
    fetchMock.mockResponse(JSON.stringify([PROJECT_A, PROJECT_B]))

    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.selectProject('proj-b')
    })

    expect(result.current.activeProject).toEqual(PROJECT_B)
    expect(localStorage.getItem('mmo-active-project')).toBe('proj-b')
  })

  test('Should restore active project from localStorage on mount', async () => {
    localStorage.setItem('mmo-active-project', 'proj-b')
    fetchMock.mockResponse(JSON.stringify([PROJECT_A, PROJECT_B]))

    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeProject).toEqual(PROJECT_B)
  })

  test('Should refetch projects when refresh is called', async () => {
    fetchMock.mockResponse(JSON.stringify([PROJECT_A]))

    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toHaveLength(1)

    fetchMock.mockResponse(JSON.stringify([PROJECT_A, PROJECT_B]))
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.projects).toHaveLength(2)
  })
})
