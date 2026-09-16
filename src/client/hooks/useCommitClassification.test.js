import { renderHook, waitFor } from '@testing-library/react'

import { useCommitClassification } from './useCommitClassification'

const ARGS = {
  repository: 'DEFRA/mmo-cr-copilot-dashboard',
  prNumber: 42,
  commit: 'abc1234',
  classification: 'Human-authored'
}

describe('#useCommitClassification', () => {
  test('Should PATCH the commit and hand the updated payload back', async () => {
    const payload = { repository: ARGS.repository, prNumber: 42 }
    fetchMock.mockResponse(JSON.stringify({ status: 'updated', payload }))
    const onUpdated = vi.fn()

    const { result } = renderHook(() => useCommitClassification(onUpdated))
    await result.current(ARGS)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      '/api/payloads/DEFRA%2Fmmo-cr-copilot-dashboard/42/commits/abc1234'
    )
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ classification: 'Human-authored' })
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(payload))
  })

  test('Should raise the backend message when the change is refused', async () => {
    fetchMock.mockResponse(JSON.stringify({ message: 'is not merged' }), {
      status: 409
    })

    const { result } = renderHook(() => useCommitClassification(vi.fn()))

    await expect(result.current(ARGS)).rejects.toThrow('is not merged')
  })

  test('Should fall back to the status code when there is no message', async () => {
    fetchMock.mockResponse('', { status: 500 })

    const { result } = renderHook(() => useCommitClassification(vi.fn()))

    await expect(result.current(ARGS)).rejects.toThrow('Request failed (500)')
  })

  test('Should tolerate a response without a payload', async () => {
    fetchMock.mockResponse(JSON.stringify({ status: 'unchanged' }))
    const onUpdated = vi.fn()

    const { result } = renderHook(() => useCommitClassification(onUpdated))
    await result.current(ARGS)

    expect(onUpdated).not.toHaveBeenCalled()
  })
})
