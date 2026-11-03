import { config } from '#/config/config.js'
import { saveSignIn } from '#/server/common/helpers/session-tokens.js'
import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { buildPayloadV2 } from '#/test-helpers/payload-fixture.js'
import { assertAdmin } from './controller.js'

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

  const write = (options) =>
    server.inject({
      ...options,
      headers: { 'x-requested-with': 'XMLHttpRequest', ...options.headers }
    })

  const upstreamUrl = () => fetchMock.mock.calls[0][0].toString()

  describe('GET /api/payloads', () => {
    test('Should no longer proxy an unscoped list of every payload', async () => {
      const { statusCode } = await server.inject('/api/payloads')

      expect(statusCode).toBe(statusCodes.notFound)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should pass contract v2 fields through the project feed', async () => {
      const v2 = buildPayloadV2()
      fetchMock.mockResponse(JSON.stringify({ payloads: [v2] }))

      const { result } = await server.inject('/api/projects/ALPH/payloads')

      expect(result).toEqual({ payloads: [v2] })
    })

    test('Should return a bad gateway when the backend is unreachable', async () => {
      fetchMock.mockReject(new Error('ECONNREFUSED'))

      const { statusCode } = await server.inject('/api/projects/ALPH/payloads')

      expect(statusCode).toBe(statusCodes.badGateway)
    })

    test('Should reject unauthenticated API request', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/api/projects/ALPH/payloads',
        headers: { 'x-dev-user-role': 'unauthenticated' }
      })

      expect(statusCode).toBe(statusCodes.unauthorized)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should send a bearer token and never a user-context header', async () => {
      fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

      const { statusCode } = await server.inject('/api/projects/ALPH/payloads')

      expect(statusCode).toBe(statusCodes.ok)
      const [, options] = fetchMock.mock.calls[0]
      expect(options.headers.authorization).toMatch(/^Bearer dev-mock\./)
      expect(options.headers['x-cdp-user-context']).toBeUndefined()
    })

    test('Should carry the caller’s group names in the dev token', async () => {
      fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

      await server.inject({
        url: '/api/projects/ALPH/payloads',
        headers: { 'x-dev-user-role': 'user', 'x-dev-user-groups': 'g1,g2' }
      })

      const [, options] = fetchMock.mock.calls[0]
      const encoded = options.headers.authorization.split('.')[1]
      const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString())
      expect(claims.groups).toEqual(['g1', 'g2'])
    })

    test('Should not forward a browser authorization or dev header', async () => {
      fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

      await server.inject({
        url: '/api/projects/ALPH/payloads',
        headers: {
          authorization: 'Bearer browser-token',
          cookie: 'a=b',
          'x-cdp-user-context': 'forged'
        }
      })

      const [, options] = fetchMock.mock.calls[0]
      expect(options.headers.authorization).not.toContain('browser-token')
      expect(options.headers.cookie).toBeUndefined()
      expect(options.headers['x-cdp-user-context']).toBeUndefined()
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

    test('Should forward asOf query parameter to the backend overview endpoint', async () => {
      fetchMock.mockResponse(JSON.stringify([]))

      const { statusCode } = await server.inject(
        '/api/sonar/overview?asOf=2025-01-15T10:00:00.000Z'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(new URL(upstreamUrl()).searchParams.get('asOf')).toBe(
        '2025-01-15T10:00:00.000Z'
      )
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

    test('Should forward asOf query parameter alongside repository', async () => {
      fetchMock.mockResponse(JSON.stringify({ configured: true }))

      const { statusCode } = await server.inject(
        '/api/sonar/repo?repository=DEFRA%2Frepo-one&asOf=2025-01-15T10:00:00.000Z'
      )

      expect(statusCode).toBe(statusCodes.ok)
      const query = new URL(upstreamUrl()).searchParams
      expect(query.get('repository')).toBe('DEFRA/repo-one')
      expect(query.get('asOf')).toBe('2025-01-15T10:00:00.000Z')
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
      const { statusCode } = await write({
        method: 'POST',
        url: '/api/payloads',
        payload: {}
      })

      expect(statusCode).toBe(statusCodes.notFound)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('Project persona mappings', () => {
    const base = '/api/projects/ALPH/persona-mappings'

    test('Should forward the read to the project route', async () => {
      fetchMock.mockResponse(
        JSON.stringify({
          mappings: [{ githubHandle: 'octocat', persona: 'qa' }]
        })
      )

      const { statusCode, result } = await server.inject(base)

      expect(statusCode).toBe(statusCodes.ok)
      expect(result.mappings).toHaveLength(1)
      expect(upstreamUrl()).toBe(`${BACKEND}${base}`)
    })

    test('Should no longer proxy the unscoped persona routes', async () => {
      const read = await server.inject('/api/persona-mappings')
      const put = await write({
        method: 'PUT',
        url: '/api/persona-mappings/octocat',
        payload: { persona: 'qa' }
      })

      expect(read.statusCode).toBe(statusCodes.notFound)
      expect(put.statusCode).toBe(statusCodes.notFound)
    })

    test('Should forward a PUT with the handle and payload and leave the role decision to the backend', async () => {
      fetchMock.mockResponse(
        JSON.stringify({ githubHandle: 'octocat', persona: 'devops' })
      )

      const { statusCode, result } = await write({
        method: 'PUT',
        url: `${base}/octocat`,
        payload: { persona: 'devops' },
        headers: { 'x-dev-user-role': 'user', 'x-dev-user-groups': 'pa' }
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ githubHandle: 'octocat', persona: 'devops' })
      expect(upstreamUrl()).toBe(`${BACKEND}${base}/octocat`)
      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('PUT')
      expect(JSON.parse(options.body)).toEqual({ persona: 'devops' })
    })

    test('Should pass a backend refusal through', async () => {
      fetchMock.mockResponse(JSON.stringify({ message: 'no' }), { status: 403 })

      const { statusCode } = await write({
        method: 'PUT',
        url: `${base}/octocat`,
        payload: { persona: 'devops' },
        headers: { 'x-dev-user-role': 'user' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
    })

    test('Should reject an unknown persona without calling the backend', async () => {
      const { statusCode } = await write({
        method: 'PUT',
        url: `${base}/octocat`,
        payload: { persona: 'manager' }
      })

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should refuse a write without the CSRF header', async () => {
      const { statusCode } = await server.inject({
        method: 'DELETE',
        url: `${base}/octocat`
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should forward a DELETE', async () => {
      fetchMock.mockResponse(null, { status: 204 })

      const { statusCode } = await write({
        method: 'DELETE',
        url: `${base}/octocat`
      })

      expect(statusCode).toBe(204)
      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('DELETE')
      expect(upstreamUrl()).toBe(`${BACKEND}${base}/octocat`)
    })
  })

  describe('PATCH /api/payloads/{repository}/{prNumber}/commits/{commit}', () => {
    const patch = (url, payload, headers) =>
      write({
        method: 'PATCH',
        url,
        payload,
        ...(headers ? { headers } : {})
      })

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

    test('Should leave the role decision to the backend', async () => {
      fetchMock.mockResponse(JSON.stringify({ message: 'no' }), { status: 403 })

      const { statusCode } = await patch(
        '/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234',
        { classification: 'Human-authored' },
        { 'x-dev-user-role': 'user' }
      )

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('Should reject unauthenticated API requests', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/api/projects',
        headers: { 'x-dev-user-role': 'unauthenticated' }
      })
      expect(statusCode).toBe(statusCodes.unauthorized)
    })

    test('Should reject mutating requests when session cookie exists without x-requested-with', async () => {
      const { statusCode } = await server.inject({
        method: 'PATCH',
        url: '/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234',
        payload: { classification: 'Human-authored' },
        headers: { cookie: 'session=abc123xyz' }
      })
      expect(statusCode).toBe(statusCodes.forbidden)
    })

    test.each([
      ['without the header', {}],
      [
        'from a foreign origin',
        { 'x-requested-with': 'XMLHttpRequest', origin: 'https://evil.example' }
      ],
      [
        'with a malformed origin',
        { 'x-requested-with': 'XMLHttpRequest', origin: 'null' }
      ]
    ])('Should refuse a write %s', async (_, headers) => {
      const { statusCode } = await server.inject({
        method: 'PATCH',
        url: '/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234',
        payload: { classification: 'Human-authored' },
        headers
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should accept a write from this host', async () => {
      fetchMock.mockResponse(JSON.stringify({ status: 'updated' }))

      const { statusCode } = await write({
        method: 'PATCH',
        url: '/api/payloads/DEFRA%2Frepo-one/42/commits/abc1234',
        payload: { classification: 'Human-authored' },
        headers: { origin: `https://${server.info.host}:${server.info.port}` }
      })

      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should log a denied admin action without personal details', () => {
      const warn = vi.fn()
      const request = {
        user: { oid: 'user-oid', name: 'Ada', roles: ['Dashboard.User'] },
        logger: { warn }
      }

      expect(() => assertAdmin(request)).toThrow('Admin role required')
      expect(warn).toHaveBeenCalledWith(
        {
          event: {
            category: 'iam',
            action: 'access-denied',
            reason: 'admin-role'
          },
          user: { id: 'user-oid' }
        },
        'Access denied'
      )
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

    test('Should keep the unscoped trail to dashboard admins', async () => {
      const { statusCode } = await server.inject({
        url: '/api/audit-logs',
        headers: { 'x-dev-user-role': 'user' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should forward a project trail for any signed-in role', async () => {
      fetchMock.mockResponse(JSON.stringify({ entries: [], total: 0 }))

      const { statusCode } = await server.inject({
        url: '/api/projects/ALPH/audit-logs?page=2&pageSize=10',
        headers: { 'x-dev-user-role': 'user', 'x-dev-user-groups': 'pu' }
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/projects/ALPH/audit-logs?page=2&pageSize=10`
      )
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

  describe('GET /api/projects', () => {
    test('Should forward to the backend projects endpoint', async () => {
      fetchMock.mockResponse(JSON.stringify([{ slug: 'ALPH' }]))

      const { statusCode, result } = await server.inject('/api/projects')

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual([{ slug: 'ALPH' }])
      expect(upstreamUrl()).toBe(`${BACKEND}/api/projects`)
    })
  })

  describe('POST /api/projects', () => {
    const validProject = {
      slug: 'ALPH',
      name: 'Alpha Project',
      type: 'ai-adopted'
    }

    test('Should forward with POST and body when user is admin', async () => {
      fetchMock.mockResponse(JSON.stringify(validProject), { status: 201 })

      const { statusCode, result } = await write({
        method: 'POST',
        url: '/api/projects',
        payload: validProject
      })

      expect(statusCode).toBe(201)
      expect(result).toEqual(validProject)
      expect(upstreamUrl()).toBe(`${BACKEND}/api/projects`)

      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual(validProject)
    })

    test('Should forbid when non-admin', async () => {
      const { statusCode } = await write({
        method: 'POST',
        url: '/api/projects',
        payload: validProject,
        headers: { 'x-dev-user-role': 'user' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/{slug}/payloads', () => {
    test('Should forward with encoded slug and query parameters', async () => {
      fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

      const { statusCode, result } = await server.inject(
        '/api/projects/ALPH/payloads?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ payloads: [] })
      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/projects/ALPH/payloads?from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z`
      )
    })
  })

  describe('GET /api/projects/{slug}/delivery-metrics', () => {
    test('Should forward with encoded slug and query parameters when admin', async () => {
      fetchMock.mockResponse(JSON.stringify({ totalQualityELoc: 100 }))

      const { statusCode, result } = await server.inject(
        '/api/projects/ALPH/delivery-metrics?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ totalQualityELoc: 100 })
      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/projects/ALPH/delivery-metrics?from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z`
      )
    })

    test('Should relay the backend’s decision for a caller with no role on the project', async () => {
      fetchMock.mockResponse(JSON.stringify({ message: 'not found' }), {
        status: 404
      })

      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/api/projects/ALPH/delivery-metrics',
        headers: {
          'x-dev-user-role': 'user',
          'x-dev-user-groups': 'group-beta'
        }
      })

      expect(statusCode).toBe(statusCodes.notFound)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('Should reject invalid slug parameter', async () => {
      const { statusCode } = await server.inject(
        '/api/projects/INVALID_SLUG!/delivery-metrics'
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/{slug}/leverage-v2', () => {
    test('Should forward the window', async () => {
      fetchMock.mockResponse(JSON.stringify({ overallLeverageScore: 1.5 }))

      const { statusCode, result } = await server.inject(
        '/api/projects/ALPH/leverage-v2?from=2026-01-01T00:00:00.000Z'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ overallLeverageScore: 1.5 })
      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/projects/ALPH/leverage-v2?from=2026-01-01T00%3A00%3A00.000Z`
      )
    })

    test('Should forward a repository so one repository can be compared', async () => {
      fetchMock.mockResponse(JSON.stringify({}))

      await server.inject(
        '/api/projects/ALPH/leverage-v2?repository=DEFRA%2Frepo-one'
      )

      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/projects/ALPH/leverage-v2?repository=DEFRA%2Frepo-one`
      )
    })

    test('Should reject an empty repository without calling the backend', async () => {
      const { statusCode } = await server.inject(
        '/api/projects/ALPH/leverage-v2?repository='
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/{slug}/ai-native-leverage', () => {
    test('Should forward with encoded slug and query to backend', async () => {
      fetchMock.mockResponse(JSON.stringify({ overallScore: 1.2 }))
      const { statusCode, result } = await server.inject(
        '/api/projects/AINA/ai-native-leverage?from=2026-01-01T00:00:00.000Z'
      )
      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ overallScore: 1.2 })
    })
  })

  describe('GET /api/projects/{slug}/jira-issues', () => {
    test('Should forward with encoded slug to backend jira-issues endpoint', async () => {
      fetchMock.mockResponse(JSON.stringify({ issues: [{ key: 'PROJ-1' }] }))

      const { statusCode, result } = await server.inject(
        '/api/projects/ALPH/jira-issues'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ issues: [{ key: 'PROJ-1' }] })
      expect(upstreamUrl()).toBe(`${BACKEND}/api/projects/ALPH/jira-issues`)
    })

    test('Should reject invalid slug parameter', async () => {
      const { statusCode } = await server.inject(
        '/api/projects/INVALID_SLUG!/jira-issues'
      )

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/projects/{slug}/jira/sync', () => {
    test('Should forward with POST to backend jira sync endpoint when admin', async () => {
      fetchMock.mockResponse(JSON.stringify({ synced: 5 }))

      const { statusCode, result } = await write({
        method: 'POST',
        url: '/api/projects/ALPH/jira/sync'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ synced: 5 })
      expect(upstreamUrl()).toBe(`${BACKEND}/api/projects/ALPH/jira/sync`)

      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('POST')
    })

    test('Should forbid when non-admin', async () => {
      const { statusCode } = await write({
        method: 'POST',
        url: '/api/projects/ALPH/jira/sync',
        headers: { 'x-dev-user-role': 'user' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should reject mutating requests when session cookie exists without x-requested-with', async () => {
      const { statusCode } = await server.inject({
        method: 'POST',
        url: '/api/projects/ALPH/jira/sync',
        headers: { cookie: 'session=abc123xyz' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should reject invalid slug parameter', async () => {
      const { statusCode } = await write({
        method: 'POST',
        url: '/api/projects/INVALID_SLUG!/jira/sync'
      })

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/repositories/unassigned', () => {
    test('Should forward to the backend unassigned repositories endpoint', async () => {
      fetchMock.mockResponse(JSON.stringify([{ fullName: 'DEFRA/repo-one' }]))

      const { statusCode, result } = await server.inject(
        '/api/repositories/unassigned'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual([{ fullName: 'DEFRA/repo-one' }])
      expect(upstreamUrl()).toBe(`${BACKEND}/api/repositories/unassigned`)
    })
  })

  describe('PUT /api/repositories/{fullName}', () => {
    const payload = {
      projectSlug: 'ALPH',
      sonarProjectKey: 'defra_repo-one'
    }

    test('Should forward with PUT and body when admin', async () => {
      fetchMock.mockResponse(
        JSON.stringify({ fullName: 'DEFRA/repo-one', ...payload })
      )

      const { statusCode, result } = await write({
        method: 'PUT',
        url: '/api/repositories/DEFRA%2Frepo-one',
        payload
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual({ fullName: 'DEFRA/repo-one', ...payload })
      expect(upstreamUrl()).toBe(`${BACKEND}/api/repositories/DEFRA%2Frepo-one`)

      const [, options] = fetchMock.mock.calls[0]
      expect(options.method).toBe('PUT')
      expect(JSON.parse(options.body)).toEqual(payload)
    })

    test('Should leave the role decision to the backend', async () => {
      fetchMock.mockResponse(JSON.stringify({ message: 'no' }), { status: 403 })

      const { statusCode } = await write({
        method: 'PUT',
        url: '/api/repositories/DEFRA%2Frepo-one',
        payload,
        headers: { 'x-dev-user-role': 'user' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('Should refuse a write without the CSRF header', async () => {
      const { statusCode } = await server.inject({
        method: 'PUT',
        url: '/api/repositories/DEFRA%2Frepo-one',
        payload
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/repositories/{fullName}', () => {
    test('Should forward the unmap', async () => {
      fetchMock.mockResponse(null, { status: 204 })

      const { statusCode } = await write({
        method: 'DELETE',
        url: '/api/repositories/DEFRA%2Frepo-one'
      })

      expect(statusCode).toBe(204)
      expect(upstreamUrl()).toBe(`${BACKEND}/api/repositories/DEFRA%2Frepo-one`)
    })
  })

  describe('role mappings', () => {
    const GROUP = 'AG-Users-CopilotAnalytics-CRAR-Admin'
    const ID = 'a'.repeat(24)
    const body = {
      groupName: GROUP,
      role: 'project-admin',
      projectSlug: 'CRAR'
    }

    test('Should list for an admin and forward the project filter', async () => {
      fetchMock.mockResponse(JSON.stringify({ roleMappings: [] }))

      const { statusCode } = await server.inject(
        '/api/role-mappings?projectSlug=CRAR'
      )

      expect(statusCode).toBe(statusCodes.ok)
      expect(upstreamUrl()).toBe(
        `${BACKEND}/api/role-mappings?projectSlug=CRAR`
      )
    })

    test('Should refuse a project admin the list without calling the backend', async () => {
      const { statusCode } = await server.inject({
        url: '/api/role-mappings?projectSlug=CRAR',
        headers: { 'x-dev-user-role': 'project-admin' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should forward a create with the exact group name', async () => {
      fetchMock.mockResponse(JSON.stringify({ roleMapping: {} }), {
        status: 201
      })

      const { statusCode } = await write({
        method: 'POST',
        url: '/api/role-mappings',
        payload: body
      })

      expect(statusCode).toBe(201)
      expect(upstreamUrl()).toBe(`${BACKEND}/api/role-mappings`)
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body)
    })

    test('Should forward a patch and a delete to the encoded id', async () => {
      fetchMock.mockResponse(JSON.stringify({ roleMapping: {} }))
      await write({
        method: 'PATCH',
        url: `/api/role-mappings/${ID}`,
        payload: { role: 'project-user' }
      })
      expect(upstreamUrl()).toBe(`${BACKEND}/api/role-mappings/${ID}`)
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')

      fetchMock.resetMocks()
      fetchMock.mockResponse(null, { status: 204 })
      const { statusCode } = await write({
        method: 'DELETE',
        url: `/api/role-mappings/${ID}`
      })
      expect(statusCode).toBe(204)
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    })

    test.each([
      ['POST', '/api/role-mappings', body],
      ['PATCH', `/api/role-mappings/${ID}`, { role: 'project-user' }],
      ['DELETE', `/api/role-mappings/${ID}`, undefined]
    ])(
      'Should refuse a %s without the CSRF header',
      async (method, url, payload) => {
        const { statusCode } = await server.inject({ method, url, payload })

        expect(statusCode).toBe(statusCodes.forbidden)
        expect(fetchMock).not.toHaveBeenCalled()
      }
    )

    test.each([
      ['POST', '/api/role-mappings', body],
      ['PATCH', `/api/role-mappings/${ID}`, { role: 'project-user' }],
      ['DELETE', `/api/role-mappings/${ID}`, undefined]
    ])(
      'Should refuse a %s from a non-admin without calling the backend',
      async (method, url, payload) => {
        const { statusCode } = await write({
          method,
          url,
          payload,
          headers: { 'x-dev-user-role': 'project-admin' }
        })

        expect(statusCode).toBe(statusCodes.forbidden)
        expect(fetchMock).not.toHaveBeenCalled()
      }
    )

    test.each([
      ['an unknown role', { ...body, role: 'owner' }],
      ['a lower-case slug', { ...body, projectSlug: 'crar' }],
      ['an unknown key', { ...body, extra: true }],
      ['no group name', { role: 'Dashboard.Admin' }]
    ])('Should reject %s', async (_, payload) => {
      const { statusCode } = await write({
        method: 'POST',
        url: '/api/role-mappings',
        payload
      })

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should reject a malformed id and an empty patch', async () => {
      const bad = await write({ method: 'DELETE', url: '/api/role-mappings/x' })
      const empty = await write({
        method: 'PATCH',
        url: `/api/role-mappings/${ID}`,
        payload: {}
      })

      expect(bad.statusCode).toBe(statusCodes.badRequest)
      expect(empty.statusCode).toBe(statusCodes.badRequest)
    })

    test('Should no longer proxy the project user-groups route', async () => {
      const { statusCode } = await write({
        method: 'PUT',
        url: '/api/projects/CRAR/user-groups',
        payload: { entraGroupIds: [] }
      })

      expect(statusCode).toBe(statusCodes.notFound)
    })
  })

  describe('Complexity model', () => {
    const model = {
      lineCap: 400,
      fileCap: 25,
      moduleCap: 5,
      weights: { lines: 0.5, files: 0.3, modules: 0.2 },
      hardCapLines: 400,
      hardCapFiles: 50
    }

    test('Should forward a model change and a recompute from an admin', async () => {
      fetchMock.mockResponse(JSON.stringify({ version: 2 }))

      const put = await write({
        method: 'PUT',
        url: '/api/projects/ALPH/complexity-model',
        payload: { ...model, version: 9 }
      })
      const post = await write({
        method: 'POST',
        url: '/api/admin/complexity/recompute'
      })

      expect(put.statusCode).toBe(statusCodes.ok)
      expect(post.statusCode).toBe(statusCodes.ok)
      const [[putUrl, putInit], [postUrl, postInit]] = fetchMock.mock.calls
      expect(putUrl.toString()).toBe(
        `${BACKEND}/api/projects/ALPH/complexity-model`
      )
      expect(JSON.parse(putInit.body)).toEqual(model)
      expect(postUrl.toString()).toBe(
        `${BACKEND}/api/admin/complexity/recompute`
      )
      expect(postInit.method).toBe('POST')
    })

    test.each([
      [
        'without the CSRF header',
        () =>
          server.inject({
            method: 'POST',
            url: '/api/admin/complexity/recompute'
          })
      ],
      [
        'from a non-admin',
        () =>
          write({
            method: 'PUT',
            url: '/api/projects/ALPH/complexity-model',
            payload: model,
            headers: { 'x-dev-user-role': 'user' }
          })
      ]
    ])('Should refuse a change %s', async (_, send) => {
      const { statusCode } = await send()

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('PR Jira links', () => {
    const url = '/api/projects/ALPH/pr-links/DEFRA%2Frepo/42'

    test('Should forward a link change from an admin', async () => {
      fetchMock.mockResponse(JSON.stringify({ links: [] }))

      const { statusCode } = await write({
        method: 'PUT',
        url,
        payload: { jiraKeys: ['MMO-1'] }
      })

      expect(statusCode).toBe(statusCodes.ok)
      const [upstream, init] = fetchMock.mock.calls[0]
      expect(upstream.toString()).toBe(
        `${BACKEND}/api/projects/ALPH/pr-links/DEFRA%2Frepo/42`
      )
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ jiraKeys: ['MMO-1'] })
    })

    test.each([
      [
        'without the CSRF header',
        () =>
          server.inject({
            method: 'PUT',
            url,
            payload: { jiraKeys: ['MMO-1'] }
          })
      ]
    ])('Should refuse a change %s', async (_, send) => {
      const { statusCode } = await send()

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should leave the role decision to the backend', async () => {
      fetchMock.mockResponse(JSON.stringify({ message: 'no' }), { status: 403 })

      const { statusCode } = await write({
        method: 'PUT',
        url,
        payload: { jiraKeys: ['MMO-1'] },
        headers: { 'x-dev-user-role': 'user' }
      })

      expect(statusCode).toBe(statusCodes.forbidden)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('Should reject a malformed Jira key', async () => {
      const { statusCode } = await write({
        method: 'PUT',
        url,
        payload: { jiraKeys: ['not a key'] }
      })

      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should forward a read for an admin', async () => {
      fetchMock.mockResponse(JSON.stringify({ links: [{ jiraKey: 'MMO-1' }] }))

      const { result } = await server.inject(url)

      expect(result).toEqual({ links: [{ jiraKey: 'MMO-1' }] })
    })
  })
})

describe('#api proxy token refresh', () => {
  let server

  beforeAll(async () => {
    config.set('auth.devBypass', false)
    server = await createServer()
    server.route({
      method: 'GET',
      path: '/test/sign-in',
      options: { app: { public: true } },
      handler: (request, h) => {
        saveSignIn(request, {
          user: { oid: 'u1', roles: ['Dashboard.Admin'] },
          tokens: {
            accessToken: 'at-1',
            refreshToken: 'rt-1',
            expiresAt: Date.now() + 3600000
          }
        })
        return h.response('ok')
      }
    })
    await server.initialize()
  })

  afterAll(async () => {
    config.set('auth.devBypass', true)
    await server.stop({ timeout: 0 })
  })

  const session = async () =>
    (await server.inject('/test/sign-in')).headers['set-cookie']
      .map((c) => c.split(';')[0])
      .join('; ')

  const mockUpstream = (
    backendStatuses,
    token = { access_token: 'at-2', expires_in: 3600 },
    tokenStatus = 200
  ) => {
    let call = 0
    fetchMock.mockResponse(async (req) => {
      if (/\/token$/.test(req.url)) {
        return { status: tokenStatus, body: JSON.stringify(token) }
      }
      if (/\/api\/auth\/me$/.test(req.url)) {
        return JSON.stringify({ user: { oid: 'u1', roles: [] } })
      }
      return {
        status: backendStatuses[call++] ?? 200,
        body: JSON.stringify({ payloads: [] })
      }
    })
  }

  const backendCalls = () =>
    fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/projects/'))

  test('Should refresh once on a 401 and retry with the new token', async () => {
    mockUpstream([401, 200])

    const { statusCode } = await server.inject({
      url: '/api/projects/ALPH/payloads',
      headers: { cookie: await session() }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(backendCalls()).toHaveLength(2)
    expect(backendCalls()[1][1].headers.authorization).toBe('Bearer at-2')
  })

  test('Should end the session when the retry is refused too', async () => {
    mockUpstream([401, 401])
    const cookie = await session()

    const first = await server.inject({
      url: '/api/projects/ALPH/payloads',
      headers: { cookie }
    })

    expect(first.statusCode).toBe(statusCodes.unauthorized)
    expect(backendCalls()).toHaveLength(2)
  })

  test('Should answer 401 when the refresh token is rejected', async () => {
    mockUpstream([401], { error: 'invalid_grant' }, 400)

    const { statusCode } = await server.inject({
      url: '/api/projects/ALPH/payloads',
      headers: { cookie: await session() }
    })

    expect(statusCode).toBe(statusCodes.unauthorized)
    expect(backendCalls()).toHaveLength(1)
  })
})
