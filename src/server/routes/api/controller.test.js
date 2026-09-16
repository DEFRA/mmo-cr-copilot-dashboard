import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const BACKEND = 'http://localhost:3001'

describe('#api proxy routes', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  const upstreamUrl = () => fetchMock.mock.calls[0][0].toString()

  describe('GET /api/payloads', () => {
    test('Should return the backend response unchanged', async () => {
      fetchMock.mockResponse(JSON.stringify({ payloads: [{ prNumber: 1 }] }))

      const { statusCode, result } = await server.inject('/api/payloads')

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ payloads: [{ prNumber: 1 }] })
      expect(upstreamUrl()).toBe(`${BACKEND}/api/payloads`)
    })

    test('Should return a bad gateway when the backend is unreachable', async () => {
      fetchMock.mockReject(new Error('ECONNREFUSED'))

      const { statusCode } = await server.inject('/api/payloads')

      expect(statusCode).toBe(statusCodes.badGateway)
    })
  })

  describe('GET /api/payloads/{repository}/{prNumber}', () => {
    test('Should re-encode the repository when forwarding', async () => {
      fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

      const { statusCode } = await server.inject(
        '/api/payloads/DEFRA%2Frepo-one/42'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(upstreamUrl()).toBe(`${BACKEND}/api/payloads/DEFRA%2Frepo-one/42`)
    })

    test('Should reject a non-numeric PR number without calling the backend', async () => {
      const { statusCode } = await server.inject(
        '/api/payloads/DEFRA%2Frepo/abc'
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should reject a PR number below one', async () => {
      const { statusCode } = await server.inject('/api/payloads/DEFRA%2Frepo/0')

      expect(statusCode).toBe(statusCodes.badRequest)
    })
  })

  describe('GET /api/sonar/overview', () => {
    test('Should forward to the backend overview endpoint', async () => {
      fetchMock.mockResponse(JSON.stringify([]))

      const { statusCode } = await server.inject('/api/sonar/overview')

      expect(statusCode).toBe(statusCodes.ok)
      expect(upstreamUrl()).toBe(`${BACKEND}/api/sonar/overview`)
    })
  })

  describe('GET /api/sonar/repo', () => {
    test('Should forward the repository query parameter', async () => {
      fetchMock.mockResponse(JSON.stringify({ configured: true }))

      const { statusCode } = await server.inject(
        '/api/sonar/repo?repository=DEFRA%2Frepo-one'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(new URL(upstreamUrl()).searchParams.get('repository')).toBe(
        'DEFRA/repo-one'
      )
    })

    test('Should reject a missing repository', async () => {
      const { statusCode } = await server.inject('/api/sonar/repo')

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should not forward unexpected query parameters', async () => {
      const { statusCode } = await server.inject(
        '/api/sonar/repo?repository=DEFRA%2Frepo-one&host=evil.example'
      )

      expect(statusCode).toBe(statusCodes.badRequest)
    })
  })

  describe('GET /api/sonar/pr', () => {
    test('Should forward the repository and PR number', async () => {
      fetchMock.mockResponse(JSON.stringify({ analyzed: true }))

      const { statusCode } = await server.inject(
        '/api/sonar/pr?repository=DEFRA%2Frepo-one&prNumber=7'
      )

      const query = new URL(upstreamUrl()).searchParams

      expect(statusCode).toBe(statusCodes.ok)
      expect(query.get('repository')).toBe('DEFRA/repo-one')
      expect(query.get('prNumber')).toBe('7')
    })

    test('Should reject a missing PR number', async () => {
      const { statusCode } = await server.inject(
        '/api/sonar/pr?repository=DEFRA%2Frepo-one'
      )

      expect(statusCode).toBe(statusCodes.badRequest)
    })
  })

  describe('Write methods', () => {
    test('Should not expose the backend write endpoint through the proxy', async () => {
      const { statusCode } = await server.inject({
        method: 'POST',
        url: '/api/payloads',
        payload: {}
      })

      expect(statusCode).toBe(statusCodes.notFound)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/persona-mappings', () => {
    test('Should return the backend response unchanged', async () => {
      fetchMock.mockResponse(
        JSON.stringify({
          mappings: [{ githubHandle: 'octocat', persona: 'qa' }]
        })
      )

      const { statusCode, result } = await server.inject(
        '/api/persona-mappings'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(result.mappings).toHaveLength(1)
      expect(upstreamUrl()).toBe(`${BACKEND}/api/persona-mappings`)
    })
  })

  describe('PUT /api/persona-mappings/{githubHandle}', () => {
    test('Should forward the handle and payload to the backend', async () => {
      fetchMock.mockResponse(
        JSON.stringify({ githubHandle: 'octocat', persona: 'devops' })
      )

      const { statusCode, result } = await server.inject({
        method: 'PUT',
        url: '/api/persona-mappings/octocat',
        payload: { persona: 'devops' }
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ githubHandle: 'octocat', persona: 'devops' })
      expect(upstreamUrl()).toBe(`${BACKEND}/api/persona-mappings/octocat`)

      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('PUT')
      expect(JSON.parse(options.body)).toEqual({ persona: 'devops' })
    })

    test('Should reject an unknown persona without calling the backend', async () => {
      const { statusCode } = await server.inject({
        method: 'PUT',
        url: '/api/persona-mappings/octocat',
        payload: { persona: 'manager' }
      })

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/persona-mappings/{githubHandle}', () => {
    test('Should forward the delete to the backend', async () => {
      fetchMock.mockResponse(null, { status: 204 })

      const { statusCode } = await server.inject({
        method: 'DELETE',
        url: '/api/persona-mappings/octocat'
      })

      expect(statusCode).toBe(204)
      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('DELETE')
      expect(upstreamUrl()).toBe(`${BACKEND}/api/persona-mappings/octocat`)
    })
  })

  describe('PATCH /api/payloads/{repository}/{prNumber}/commits/{commit}', () => {
    const patch = (url, payload) =>
      server.inject({ method: 'PATCH', url, payload })

    test('Should forward the classification to the backend', async () => {
      fetchMock.mockResponse(JSON.stringify({ status: 'updated' }))

      const { statusCode } = await patch(
        '/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234',
        { classification: 'Human-authored' }
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234`
      )

      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('PATCH')
      expect(JSON.parse(options.body)).toEqual({
        classification: 'Human-authored'
      })
    })

    test('Should pass the backend refusal straight through', async () => {
      fetchMock.mockResponse(JSON.stringify({ message: 'is not merged' }), {
        status: 409
      })

      const { statusCode, result } = await patch(
        '/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234',
        { classification: 'Human-authored' }
      )

      expect(statusCode).toBe(409)
      expect(result.message).toBe('is not merged')
    })

    test('Should reject an unknown classification without calling the backend', async () => {
      const { statusCode } = await patch(
        '/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234',
        { classification: 'Vibes' }
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should reject a commit that is not a SHA', async () => {
      const { statusCode } = await patch(
        '/api/payloads/DEFRA%2Frepo-one/42/commits/..%2Fsecrets',
        { classification: 'Rebase' }
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/audit-logs', () => {
    test('Should forward the window and paging to the backend', async () => {
      fetchMock.mockResponse(JSON.stringify({ entries: [], total: 0 }))

      const { statusCode } = await server.inject(
        '/api/audit-logs?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z&page=2&pageSize=50'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/audit-logs?from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z&page=2&pageSize=50`
      )
    })

    test('Should forward an unfiltered request without empty parameters', async () => {
      fetchMock.mockResponse(JSON.stringify({ entries: [], total: 0 }))

      await server.inject('/api/audit-logs')

      expect(upstreamUrl()).toBe(`${BACKEND}/api/audit-logs`)
    })

    test('Should reject a window that ends before it starts', async () => {
      const { statusCode } = await server.inject(
        '/api/audit-logs?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z'
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should reject a page size beyond the cap', async () => {
      const { statusCode } = await server.inject(
        '/api/audit-logs?pageSize=5000'
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
