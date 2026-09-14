import { backendRequest } from './backend-client.js'

const options = { baseUrl: 'http://backend:3001', timeoutMs: 500 }

const logger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })

describe('#backendRequest', () => {
  test('Should build the upstream URL from the base URL and path', async () => {
    fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

    await backendRequest({ path: '/api/payloads' }, options)

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'http://backend:3001/api/payloads'
    )
  })

  test('Should strip trailing slashes from the base URL', async () => {
    fetchMock.mockResponse(JSON.stringify({}))

    await backendRequest(
      { path: '/api/payloads' },
      { ...options, baseUrl: 'http://backend:3001//' }
    )

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'http://backend:3001/api/payloads'
    )
  })

  test('Should append defined query parameters only', async () => {
    fetchMock.mockResponse(JSON.stringify({}))

    await backendRequest(
      {
        path: '/api/sonar/pr',
        query: { repository: 'DEFRA/repo', prNumber: 7, missing: undefined }
      },
      options
    )

    const url = new URL(fetchMock.mock.calls[0][0])

    expect(url.searchParams.get('repository')).toBe('DEFRA/repo')
    expect(url.searchParams.get('prNumber')).toBe('7')
    expect(url.searchParams.has('missing')).toBe(false)
  })

  test('Should send a JSON body and content type for a POST', async () => {
    fetchMock.mockResponse(JSON.stringify({ status: 'stored' }), {
      status: 201
    })

    const result = await backendRequest(
      { path: '/api/payloads', method: 'POST', body: { prNumber: 1 } },
      options
    )

    const [, init] = fetchMock.mock.calls[0]

    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"prNumber":1}')
    expect(result).toEqual({ statusCode: 201, payload: { status: 'stored' } })
  })

  test('Should forward custom headers', async () => {
    fetchMock.mockResponse(JSON.stringify({}))

    await backendRequest(
      { path: '/api/payloads', headers: { 'x-ingest-token': 'secret' } },
      options
    )

    expect(fetchMock.mock.calls[0][1].headers['x-ingest-token']).toBe('secret')
  })

  test('Should relay the upstream status code', async () => {
    fetchMock.mockResponse(JSON.stringify({ error: 'Bad Request' }), {
      status: 400
    })

    const result = await backendRequest({ path: '/api/payloads' }, options)

    expect(result.statusCode).toBe(400)
    expect(result.payload).toEqual({ error: 'Bad Request' })
  })

  test('Should return a null payload for an empty body', async () => {
    fetchMock.mockResponse('')

    await expect(
      backendRequest({ path: '/api/payloads' }, options)
    ).resolves.toEqual({ statusCode: 200, payload: null })
  })

  test('Should raise a bad gateway when the backend is unreachable', async () => {
    fetchMock.mockReject(new Error('ECONNREFUSED'))
    const log = logger()

    await expect(
      backendRequest({ path: '/api/payloads', logger: log }, options)
    ).rejects.toThrow('could not be reached')
    expect(log.error).toHaveBeenCalled()
  })

  test('Should raise a bad gateway when the backend returns non-JSON', async () => {
    fetchMock.mockResponse('<html>gateway timeout</html>')
    const log = logger()

    await expect(
      backendRequest({ path: '/api/payloads', logger: log }, options)
    ).rejects.toThrow('invalid response')
    expect(log.error).toHaveBeenCalled()
  })

  test('Should not require a logger', async () => {
    fetchMock.mockReject(new Error('ECONNREFUSED'))

    await expect(
      backendRequest({ path: '/api/payloads' }, options)
    ).rejects.toThrow()
  })
})
