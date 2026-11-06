import Boom from '@hapi/boom'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

import { config } from '#/config/config.js'
import { requireIngestToken, INGEST_TOKEN_HEADER } from './ingest-auth.js'

const JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks'
const OWNER_ID = '5528822'
const WORKFLOW =
  'DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics.yml@refs/heads/main'

const readConfig = config.get.bind(config)

function fakeCache() {
  const store = new Map()
  return {
    get: vi.fn(async (key) => store.get(key) ?? null),
    set: vi.fn(async (key, value) => store.set(key, value))
  }
}

function createRequest(headers = {}, cache = fakeCache()) {
  return {
    headers,
    app: {},
    server: { app: { ingestJtiCache: cache } },
    logger: { warn: vi.fn(), info: vi.fn() }
  }
}

const h = { continue: Symbol('continue') }

describe('#requireIngestToken', () => {
  let settings

  beforeEach(() => {
    settings = {
      'ingest.token': '',
      'ingest.allowSharedToken': true,
      'ingest.oidc.ownerId': OWNER_ID
    }
    vi.spyOn(config, 'get').mockImplementation((key) =>
      key in settings ? settings[key] : readConfig(key)
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('With the shared token', () => {
    test('Should allow the request but warn when no token is configured', async () => {
      const request = createRequest()

      expect(await requireIngestToken(request, h)).toBe(h.continue)
      expect(request.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('INGEST_TOKEN is not set')
      )
    })

    test('Should allow a request presenting the correct token', async () => {
      settings['ingest.token'] = 'expected-token'
      const request = createRequest({ [INGEST_TOKEN_HEADER]: 'expected-token' })

      expect(await requireIngestToken(request, h)).toBe(h.continue)
      expect(request.logger.warn).not.toHaveBeenCalled()
    })

    test.each([
      ['missing', {}],
      ['incorrect', { [INGEST_TOKEN_HEADER]: 'wrong-token' }]
    ])('Should reject a %s token', async (_, headers) => {
      settings['ingest.token'] = 'expected-token'

      await expect(
        requireIngestToken(createRequest(headers), h)
      ).rejects.toThrow(Boom.unauthorized('Invalid ingest token'))
    })

    test('Should refuse the shared token once it is switched off', async () => {
      settings['ingest.token'] = 'expected-token'
      settings['ingest.allowSharedToken'] = false

      await expect(
        requireIngestToken(
          createRequest({ [INGEST_TOKEN_HEADER]: 'expected-token' }),
          h
        )
      ).rejects.toThrow('Invalid ingest credentials')
    })
  })

  describe('With a GitHub Actions OIDC token', () => {
    let key
    let foreignKey
    let jwks

    beforeAll(async () => {
      const pair = await generateKeyPair('RS256')
      key = pair.privateKey
      jwks = {
        keys: [
          { ...(await exportJWK(pair.publicKey)), kid: 'gh1', alg: 'RS256' }
        ]
      }
      foreignKey = (await generateKeyPair('RS256')).privateKey
    })

    beforeEach(() => {
      fetchMock.mockResponse((req) =>
        req.url === JWKS_URL ? JSON.stringify(jwks) : { status: 404, body: '' }
      )
    })

    const token = (claims = {}, options = {}) =>
      new SignJWT({
        repository: 'DEFRA/mmo-cr-pdf',
        repository_owner_id: OWNER_ID,
        job_workflow_ref: WORKFLOW,
        event_name: 'pull_request',
        jti: crypto.randomUUID(),
        ...claims
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'gh1' })
        .setIssuer(
          options.issuer ?? 'https://token.actions.githubusercontent.com'
        )
        .setAudience(options.audience ?? 'mmo-cr-copilot-dashboard')
        .setIssuedAt()
        .setExpirationTime(options.expiresIn ?? '5m')
        .sign(options.key ?? key)

    const bearer = (jwt) => createRequest({ authorization: `Bearer ${jwt}` })

    test('Should accept a valid token and keep its claims', async () => {
      const request = bearer(await token())

      expect(await requireIngestToken(request, h)).toBe(h.continue)
      expect(request.app.ingestClaims.repository).toBe('DEFRA/mmo-cr-pdf')
    })

    test('Should accept a valid token even when the shared token is off', async () => {
      settings['ingest.allowSharedToken'] = false

      expect(await requireIngestToken(bearer(await token()), h)).toBe(
        h.continue
      )
    })

    test.each([
      ['a wrong audience', {}, { audience: 'someone-else' }],
      ['a wrong issuer', {}, { issuer: 'https://evil.example' }],
      ['an expired token', {}, { expiresIn: '-5m' }],
      ['a foreign signing key', {}, { key: 'foreign' }],
      ['another organisation', { repository_owner_id: '1' }, {}],
      [
        'another workflow',
        {
          job_workflow_ref:
            'DEFRA/other/.github/workflows/x.yml@refs/heads/main'
        },
        {}
      ],
      ['a disallowed event', { event_name: 'push' }, {}]
    ])('Should reject %s', async (_, claims, options) => {
      const jwt = await token(claims, {
        ...options,
        ...(options.key === 'foreign' && { key: foreignKey })
      })
      const request = bearer(jwt)

      await expect(requireIngestToken(request, h)).rejects.toThrow(
        'Invalid ingest credentials'
      )
      expect(request.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ outcome: 'failure' })
        }),
        'Rejected ingest request'
      )
    })

    test('Should reject OIDC tokens while the organisation id is unset', async () => {
      settings['ingest.oidc.ownerId'] = ''

      await expect(
        requireIngestToken(bearer(await token()), h)
      ).rejects.toThrow('Invalid ingest credentials')
    })

    test('Should reject a replayed token', async () => {
      const cache = fakeCache()
      const jwt = await token()
      await requireIngestToken(
        createRequest({ authorization: `Bearer ${jwt}` }, cache),
        h
      )

      await expect(
        requireIngestToken(
          createRequest({ authorization: `Bearer ${jwt}` }, cache),
          h
        )
      ).rejects.toThrow('Invalid ingest credentials')
    })
  })
})
