import { act, renderHook, waitFor } from '@testing-library/react'

import { FORBIDDEN, NO_JIRA_KEY, VALIDATION_FAILED } from '../lib/api-errors.js'
import {
  LOAD_FAILED,
  useJiraStatuses,
  useJiraWorkflow
} from './useJiraWorkflow.js'

const WORKFLOW = {
  source: 'detected',
  version: 0,
  updatedAt: null,
  updatedBy: null,
  detectedAt: '2026-11-04T08:00:00.000Z',
  detectedCount: 2,
  stages: [
    {
      id: 'todo',
      label: 'To Do',
      kind: 'todo',
      required: true,
      statuses: ['Open']
    },
    {
      id: 'done',
      label: 'Done',
      kind: 'done',
      required: true,
      statuses: ['Done']
    }
  ],
  suggestions: { todo: ['To Do'] }
}

describe('#useJiraWorkflow', () => {
  test('Should stay idle without a project', () => {
    const { result } = renderHook(() => useJiraWorkflow(null))

    expect(result.current.status).toBe('idle')
    expect(result.current.workflow).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should load the workflow from the project route', async () => {
    fetchMock.mockResponse(JSON.stringify(WORKFLOW))

    const { result } = renderHook(() => useJiraWorkflow('ALPH'))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/ALPH/jira/workflow')
    expect(result.current.workflow.source).toBe('detected')
    expect(result.current.workflow.stages).toHaveLength(2)
  })

  test.each([
    ['a failing status', () => fetchMock.mockResponse('', { status: 500 })],
    [
      'a malformed body',
      () => fetchMock.mockResponse(JSON.stringify({ source: 'x' }))
    ]
  ])('Should report an error for %s', async (_, respond) => {
    respond()

    const { result } = renderHook(() => useJiraWorkflow('ALPH'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.workflow).toBeNull()
  })

  test('Should keep the last workflow when a reload fails', async () => {
    fetchMock.mockResponse(JSON.stringify(WORKFLOW))
    const { result } = renderHook(() => useJiraWorkflow('ALPH'))
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockResponse('', { status: 502 })
    act(() => result.current.reload())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.workflow.source).toBe('detected')
  })

  test('Should save with the version and adopt the response', async () => {
    fetchMock.mockResponse(JSON.stringify(WORKFLOW))
    const { result } = renderHook(() => useJiraWorkflow('ALPH'))
    await waitFor(() => expect(result.current.status).toBe('success'))

    const saved = {
      ...WORKFLOW,
      source: 'project',
      version: 1,
      updatedBy: { name: 'A Person' }
    }
    fetchMock.mockResponse(JSON.stringify(saved))
    let outcome
    await act(async () => {
      outcome = await result.current.save(WORKFLOW.stages, 0)
    })

    expect(outcome.ok).toBe(true)
    expect(result.current.workflow.source).toBe('project')
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/projects/ALPH/jira/workflow')
    expect(options.method).toBe('PUT')
    expect(options.headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(JSON.parse(options.body)).toEqual({
      version: 0,
      stages: [
        { id: 'todo', statuses: ['Open'] },
        { id: 'done', statuses: ['Done'] }
      ]
    })
  })

  test('Should return the status and message of a refused save', async () => {
    fetchMock.mockResponse(JSON.stringify(WORKFLOW))
    const { result } = renderHook(() => useJiraWorkflow('ALPH'))
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockResponse(JSON.stringify({ message: 'Changed' }), {
      status: 409
    })
    let outcome
    await act(async () => {
      outcome = await result.current.save(WORKFLOW.stages, 0)
    })

    expect(outcome).toEqual({ ok: false, status: 409, message: 'Changed' })
    expect(result.current.workflow.source).toBe('detected')
  })

  test('Should cope with a save that cannot reach the server', async () => {
    fetchMock.mockResponse(JSON.stringify(WORKFLOW))
    const { result } = renderHook(() => useJiraWorkflow('ALPH'))
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockReject(new Error('offline'))
    let outcome
    await act(async () => {
      outcome = await result.current.save(WORKFLOW.stages, 0)
    })

    expect(outcome).toEqual({
      ok: false,
      status: 0,
      message: 'The Jira workflow could not be saved. Try again.'
    })
  })

  test.each([
    [400, 'Done needs at least one status', 'Done needs at least one status'],
    [400, 'Invalid request input', VALIDATION_FAILED],
    [403, 'Project admin role required', FORBIDDEN],
    [422, 'Project has no Jira project key', NO_JIRA_KEY],
    [500, 'stack trace', 'The Jira workflow could not be saved. Try again.']
  ])(
    'Should read a %i save refusal from its body',
    async (status, message, expected) => {
      fetchMock.mockResponse(JSON.stringify(WORKFLOW))
      const { result } = renderHook(() => useJiraWorkflow('ALPH'))
      await waitFor(() => expect(result.current.status).toBe('success'))

      fetchMock.mockResponse(JSON.stringify({ statusCode: status, message }), {
        status
      })
      let outcome
      await act(async () => {
        outcome = await result.current.save(WORKFLOW.stages, 0)
      })

      expect(outcome).toEqual({ ok: false, status, message: expected })
    }
  )

  test('Should report a load refused for a project without a Jira key', async () => {
    fetchMock.mockResponse(
      JSON.stringify({
        statusCode: 422,
        message: 'Project has no Jira project key'
      }),
      { status: 422 }
    )

    const { result } = renderHook(() => useJiraWorkflow('ALPH'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toEqual({ status: 422, message: NO_JIRA_KEY })
  })

  test('Should report a malformed workflow with the generic load message', async () => {
    fetchMock.mockResponse(JSON.stringify({ source: 'x' }))

    const { result } = renderHook(() => useJiraWorkflow('ALPH'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toEqual({ status: 0, message: LOAD_FAILED })
  })

  test('Should drop a response that arrives after unmount', async () => {
    let finish
    fetchMock.mockResponse(() => new Promise((resolve) => (finish = resolve)))
    const { result, unmount } = renderHook(() => useJiraWorkflow('ALPH'))
    expect(result.current.status).toBe('loading')

    unmount()
    finish(JSON.stringify(WORKFLOW))

    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })

  test('Should never show one project’s workflow for another', async () => {
    fetchMock.mockResponse(JSON.stringify(WORKFLOW))
    const { result, rerender } = renderHook(
      ({ slug }) => useJiraWorkflow(slug),
      {
        initialProps: { slug: 'ALPH' }
      }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockResponse('', { status: 502 })
    rerender({ slug: 'BETA' })

    expect(result.current.status).toBe('loading')
    expect(result.current.workflow).toBeNull()
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.workflow).toBeNull()
  })

  test('Should drop a save that finishes after the project changed', async () => {
    fetchMock.mockResponse(JSON.stringify(WORKFLOW))
    const { result, rerender } = renderHook(
      ({ slug }) => useJiraWorkflow(slug),
      {
        initialProps: { slug: 'ALPH' }
      }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    const saveAlpha = result.current.save

    let finish
    fetchMock.mockResponse(() => new Promise((resolve) => (finish = resolve)))
    rerender({ slug: 'BETA' })
    await act(async () => {
      const pending = saveAlpha(WORKFLOW.stages, 0)
      finish(JSON.stringify({ ...WORKFLOW, source: 'project', version: 1 }))
      await pending
    })

    expect(result.current.workflow?.source).not.toBe('project')
  })
})

describe('#useJiraStatuses', () => {
  test('Should stay idle without a project', () => {
    const { result } = renderHook(() => useJiraStatuses(undefined))

    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should load and clean the statuses', async () => {
    fetchMock.mockResponse(
      JSON.stringify({
        jiraConfigured: true,
        jiraAvailable: false,
        statuses: [
          {
            name: 'In Dev',
            categoryKey: 'indeterminate',
            issueCount: 4,
            inJira: true
          },
          { name: 'Odd', categoryKey: 'weird' },
          { name: ' ' },
          null
        ]
      })
    )

    const { result } = renderHook(() => useJiraStatuses('ALPH'))

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/ALPH/jira/statuses')
    expect(result.current.jiraAvailable).toBe(false)
    expect(result.current.statuses).toEqual([
      {
        name: 'In Dev',
        categoryKey: 'indeterminate',
        issueCount: 4,
        inJira: true
      },
      { name: 'Odd', categoryKey: null, issueCount: 0, inJira: false }
    ])
  })

  test('Should report an error and refresh on request', async () => {
    fetchMock.mockResponse('', { status: 500 })
    const { result } = renderHook(() => useJiraStatuses('ALPH'))
    await waitFor(() => expect(result.current.status).toBe('error'))

    fetchMock.mockResponse(JSON.stringify({}))
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.statuses).toEqual([])
    expect(result.current.jiraAvailable).toBe(true)
  })

  test('Should start empty for another project and keep the list on a same-project refresh', async () => {
    const body = { statuses: [{ name: 'Open', categoryKey: 'new' }] }
    fetchMock.mockResponse(JSON.stringify(body))
    const { result, rerender } = renderHook(
      ({ slug }) => useJiraStatuses(slug),
      {
        initialProps: { slug: 'ALPH' }
      }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockResponse(() => new Promise(() => {}))
    act(() => result.current.refresh())
    expect(result.current.status).toBe('loading')
    expect(result.current.statuses).toHaveLength(1)

    rerender({ slug: 'BETA' })
    expect(result.current.status).toBe('loading')
    expect(result.current.statuses).toEqual([])
  })
})
