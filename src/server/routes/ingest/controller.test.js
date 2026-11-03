import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { buildPayloadV2 } from '#/test-helpers/payload-fixture.js'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

const INGEST_TOKEN = 'test-ingest-token'

// Captured before any spy is installed so the stub can delegate to the real
// config for every key other than the ingest token.
const readConfig = config.get.bind(config)

// The verifier caches the remote key set, so every OIDC test shares one key pair.
const oidcKeys = generateKeyPair('RS256').then(async (pair) => ({
  key: pair.privateKey,
  jwks: {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'gh1', alg: 'RS256' }]
  }
}))

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

    test('Should forward a contract v2 payload without dropping a key', async () => {
      fetchMock.mockResponse(JSON.stringify({ status: 'stored' }), {
        status: 201
      })
      const v2 = buildPayloadV2()

      const { statusCode } = await post({ 'x-ingest-token': INGEST_TOKEN }, v2)

      expect(statusCode).toBe(statusCodes.created)
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(v2)
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

  describe('With a GitHub Actions OIDC token', () => {
    const JWKS_URL =
      'https://token.actions.githubusercontent.com/.well-known/jwks'
    let key
    let jwks

    beforeAll(async () => {
      ;({ key, jwks } = await oidcKeys)
    })

    beforeEach(() => {
      vi.spyOn(config, 'get').mockImplementation((k) => {
        if (k === 'ingest.oidc.ownerId') return '5528822'
        if (k === 'ingest.token') return INGEST_TOKEN
        return readConfig(k)
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    const token = (repository) =>
      new SignJWT({
        repository,
        repository_owner_id: '5528822',
        job_workflow_ref:
          'DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics.yml@refs/heads/main',
        event_name: 'pull_request',
        jti: crypto.randomUUID()
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'gh1' })
        .setIssuer('https://token.actions.githubusercontent.com')
        .setAudience('mmo-cr-copilot-dashboard')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key)

    const mockBackend = (mapped) =>
      fetchMock.mockResponse((req) => {
        if (req.url === JWKS_URL) return JSON.stringify(jwks)
        if (req.url.includes('/api/ingest/repositories/')) {
          const fullName = decodeURIComponent(req.url.split('/').pop())
          return JSON.stringify({ fullName, mapped: mapped.includes(fullName) })
        }
        return { status: 201, body: JSON.stringify({ status: 'stored' }) }
      })

    test('Should forward a payload from its own mapped repository', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode } = await post({
        authorization: `Bearer ${await token('DEFRA/repo')}`
      })

      expect(statusCode).toBe(statusCodes.created)
    })

    test('Should look the repository up with the ingest token, not user credentials', async () => {
      mockBackend(['DEFRA/repo'])

      await post({ authorization: `Bearer ${await token('DEFRA/repo')}` })

      const lookup = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/ingest/repositories/')
      )
      expect(String(lookup[0])).toBe(
        'http://localhost:3001/api/ingest/repositories/DEFRA%2Frepo'
      )
      expect(lookup[1].headers['x-ingest-token']).toBe(INGEST_TOKEN)
      expect(lookup[1].headers.authorization).toBeUndefined()
    })

    test('Should refuse when the backend rejects the lookup', async () => {
      fetchMock.mockResponse((req) =>
        req.url === JWKS_URL
          ? JSON.stringify(jwks)
          : { status: 401, body: JSON.stringify({}) }
      )

      const { statusCode } = await post({
        authorization: `Bearer ${await token('DEFRA/repo')}`
      })

      expect(statusCode).toBe(statusCodes.forbidden)
    })

    test('Should refuse a payload for another repository', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode } = await post({
        authorization: `Bearer ${await token('DEFRA/other')}`
      })

      expect(statusCode).toBe(statusCodes.forbidden)
    })

    test('Should refuse a payload from an unmapped repository', async () => {
      mockBackend([])

      const { statusCode } = await post({
        authorization: `Bearer ${await token('DEFRA/repo')}`
      })

      expect(statusCode).toBe(statusCodes.forbidden)
    })

    test('Should refuse the same token twice', async () => {
      mockBackend(['DEFRA/repo'])
      const authorization = `Bearer ${await token('DEFRA/repo')}`

      await post({ authorization })
      const { statusCode } = await post({ authorization })

      expect(statusCode).toBe(statusCodes.unauthorized)
    })
  })

  describe('POST /api/ingest/survival', () => {
    const JWKS_URL =
      'https://token.actions.githubusercontent.com/.well-known/jwks'
    const SURVIVAL_REF =
      'DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics-survival.yml@refs/heads/main'
    const survivalBody = {
      kind: 'ai-survival',
      repository: 'DEFRA/repo',
      prNumber: 7,
      windowDays: 21
    }
    let key
    let jwks

    beforeAll(async () => {
      ;({ key, jwks } = await oidcKeys)
    })

    beforeEach(() => {
      vi.spyOn(config, 'get').mockImplementation((k) => {
        if (k === 'ingest.oidc.ownerId') return '5528822'
        if (k === 'ingest.token') return INGEST_TOKEN
        return readConfig(k)
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    const token = ({
      repository = 'DEFRA/repo',
      workflow = SURVIVAL_REF,
      event = 'schedule'
    } = {}) =>
      new SignJWT({
        repository,
        repository_owner_id: '5528822',
        job_workflow_ref: workflow,
        event_name: event,
        jti: crypto.randomUUID()
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'gh1' })
        .setIssuer('https://token.actions.githubusercontent.com')
        .setAudience('mmo-cr-copilot-dashboard')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key)

    const mockBackend = (mapped, survivalResponse) =>
      fetchMock.mockResponse((req) => {
        if (req.url === JWKS_URL) return JSON.stringify(jwks)
        if (req.url.includes('/api/ingest/repositories/')) {
          const fullName = decodeURIComponent(req.url.split('/').pop())
          return JSON.stringify({ fullName, mapped: mapped.includes(fullName) })
        }
        return (
          survivalResponse ?? {
            status: 201,
            body: JSON.stringify({ status: 'created' })
          }
        )
      })

    const postSurvival = (headers, payload = survivalBody) =>
      server.inject({
        method: 'POST',
        url: '/api/ingest/survival',
        headers: { 'content-type': 'application/json', ...headers },
        payload
      })

    const bearer = async (options) => ({
      authorization: `Bearer ${await token(options)}`
    })

    test('Should forward a record from its own mapped repository with the shared secret', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode, result } = await postSurvival(await bearer())

      expect(statusCode).toBe(statusCodes.created)
      expect(result).toEqual({ status: 'created' })
      const [, init] = fetchMock.mock.calls.at(-1)
      expect(fetchMock.mock.calls.at(-1)[0].toString()).toBe(
        'http://localhost:3001/api/survival'
      )
      expect(init.headers['x-ingest-token']).toBe(INGEST_TOKEN)
      expect(JSON.parse(init.body)).toEqual(survivalBody)
    })

    test('Should refuse a request without a bearer token, even with the shared secret', async () => {
      const { statusCode } = await postSurvival({
        'x-ingest-token': INGEST_TOKEN
      })

      expect(statusCode).toBe(statusCodes.unauthorized)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Should refuse a token from the analytics workflow', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode } = await postSurvival(
        await bearer({
          workflow:
            'DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics.yml@refs/heads/main'
        })
      )

      expect(statusCode).toBe(statusCodes.unauthorized)
    })

    test('Should refuse a survival token on the analytics route', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode } = await post(await bearer())

      expect(statusCode).toBe(statusCodes.unauthorized)
    })

    test('Should refuse an event that is not allowed', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode } = await postSurvival(
        await bearer({ event: 'pull_request' })
      )

      expect(statusCode).toBe(statusCodes.unauthorized)
    })

    test('Should refuse a record for another repository', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode } = await postSurvival(
        await bearer({ repository: 'DEFRA/other' })
      )

      expect(statusCode).toBe(statusCodes.forbidden)
    })

    test('Should refuse a record from an unmapped repository', async () => {
      mockBackend([])

      const { statusCode } = await postSurvival(await bearer())

      expect(statusCode).toBe(statusCodes.forbidden)
    })

    test('Should refuse the same token twice', async () => {
      mockBackend(['DEFRA/repo'])
      const headers = await bearer()

      await postSurvival(headers)
      const { statusCode } = await postSurvival(headers)

      expect(statusCode).toBe(statusCodes.unauthorized)
    })

    test('Should reject a body without the routing keys before calling the backend', async () => {
      mockBackend(['DEFRA/repo'])

      const { statusCode } = await postSurvival(await bearer(), {
        repository: 'DEFRA/repo'
      })

      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should relay a backend rejection unchanged', async () => {
      mockBackend(['DEFRA/repo'], {
        status: 400,
        body: JSON.stringify({ message: 'Invalid request payload input' })
      })

      const { statusCode, result } = await postSurvival(await bearer())

      expect(statusCode).toBe(statusCodes.badRequest)
      expect(result).toEqual({ message: 'Invalid request payload input' })
    })

    test('Should return a bad gateway when the backend is unreachable', async () => {
      fetchMock.mockResponse((req) =>
        req.url === JWKS_URL
          ? JSON.stringify(jwks)
          : Promise.reject(new Error('ECONNREFUSED'))
      )

      const { statusCode } = await postSurvival(await bearer())

      expect(statusCode).toBe(statusCodes.badGateway)
    })
  })
})
