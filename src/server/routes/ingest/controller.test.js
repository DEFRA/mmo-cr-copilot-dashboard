import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const INGEST_TOKEN = 'test-ingest-token'

// Captured before any spy is installed so the stub can delegate to the real
// config for every key other than the ingest token.
const readConfig = config.get.bind(config)

const body = { prNumber: 42, repository: 'DEFRA/repo' }

describe('#ingest route', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  const post = (headers, payload = body) =>
    server.inject({
      method: 'POST',
      url: '/api/ingest',
      headers: { 'content-type': 'application/json', ...headers },
      payload
    })

  describe('When a token is configured', () => {
    beforeEach(() => {
      vi.spyOn(config, 'get').mockImplementation((key) =>
        key === 'ingest.token' ? INGEST_TOKEN : readConfig(key)
      )
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    test('Should forward an authenticated payload to the backend', async () => {
      fetchMock.mockResponse(JSON.stringify({ status: 'stored' }), {
        status: 201
      })

      const { statusCode, result } = await post({
        'x-ingest-token': INGEST_TOKEN
      })

      expect(statusCode).toBe(statusCodes.created)
      expect(result).toEqual({ status: 'stored' })

      const [url, init] = fetchMock.mock.calls[0]

      expect(url.toString()).toBe('http://localhost:3001/api/payloads')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual(body)
    })

    test('Should present the shared secret to the backend', async () => {
      fetchMock.mockResponse(JSON.stringify({}), { status: 201 })

      await post({ 'x-ingest-token': INGEST_TOKEN })

      expect(fetchMock.mock.calls[0][1].headers['x-ingest-token']).toBe(
        INGEST_TOKEN
      )
    })

    test('Should reject a request with no token before calling the backend', async () => {
      const { statusCode } = await post({})

      expect(statusCode).toBe(statusCodes.unauthorized)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should reject a request with the wrong token', async () => {
      const { statusCode } = await post({ 'x-ingest-token': 'wrong' })

      expect(statusCode).toBe(statusCodes.unauthorized)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should relay a validation failure from the backend unchanged', async () => {
      fetchMock.mockResponse(
        JSON.stringify({ message: 'Invalid request payload input' }),
        { status: 400 }
      )

      const { statusCode, result } = await post({
        'x-ingest-token': INGEST_TOKEN
      })

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(result).toEqual({ message: 'Invalid request payload input' })
    })

    test('Should return a bad gateway when the backend is unreachable', async () => {
      fetchMock.mockReject(new Error('ECONNREFUSED'))

      const { statusCode } = await post({ 'x-ingest-token': INGEST_TOKEN })

      expect(statusCode).toBe(statusCodes.badGateway)
    })

    test('Should reject a non-JSON content type', async () => {
      const { statusCode } = await server.inject({
        method: 'POST',
        url: '/api/ingest',
        headers: {
          'content-type': 'text/plain',
          'x-ingest-token': INGEST_TOKEN
        },
        payload: 'not json'
      })

      expect(statusCode).toBe(415)
    })
  })

  describe('When no token is configured', () => {
    test('Should accept the request so local development works without secrets', async () => {
      fetchMock.mockResponse(JSON.stringify({ status: 'stored' }), {
        status: 201
      })

      const { statusCode } = await post({})

      expect(statusCode).toBe(statusCodes.created)
    })
  })
})
