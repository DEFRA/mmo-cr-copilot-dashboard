import { SignJWT, exportJWK, generateKeyPair } from 'jose'

import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { safeReturnTo } from './controller.js'

const TENANT = '11111111-2222-3333-4444-555555555555'
const CLIENT = 'client-id'
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`
const KEYS_URL = `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`

const cookieHeader = (res) =>
  (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ')

describe('#safeReturnTo', () => {
  test.each([
    ['/repository', '/repository'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    [undefined, '/']
  ])('Should map %s to %s', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected)
  })
})

describe('#auth routes with Entra configured', () => {
  let server
  let signingKey
  let jwks
  let foreignKey

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256')
    signingKey = pair.privateKey
    jwks = {
      keys: [
        {
          ...(await exportJWK(pair.publicKey)),
          kid: 'k1',
          alg: 'RS256',
          use: 'sig'
        }
      ]
    }
    foreignKey = (await generateKeyPair('RS256')).privateKey

    config.set('auth.entraTenantId', TENANT)
    config.set('auth.entraClientId', CLIENT)
    config.set('auth.entraClientSecret', 'secret')
    config.set('auth.devBypass', false)
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    config.set('auth.entraTenantId', '')
    config.set('auth.entraClientId', '')
    config.set('auth.entraClientSecret', '')
    config.set('auth.devBypass', true)
    await server.stop({ timeout: 0 })
  })

  const startLogin = async (returnTo) => {
    const res = await server.inject(
      returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'
    )
    const location = new URL(res.headers.location)
    return {
      cookie: cookieHeader(res),
      state: location.searchParams.get('state'),
      nonce: location.searchParams.get('nonce'),
      location
    }
  }

  const idToken = (claims = {}, { key = signingKey, expiresIn = '5m' } = {}) =>
    new SignJWT({
      oid: 'user-oid',
      tid: TENANT,
      name: 'Ada',
      roles: ['Dashboard.User'],
      groups: ['g1'],
      ...claims
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(claims.iss ?? ISSUER)
      .setAudience(claims.aud ?? CLIENT)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key)

  const AUTHORIZE_URL = /\/api\/auth\/authorize$/
  const backendUser = {
    oid: 'user-oid',
    tid: TENANT,
    name: 'Ada',
    roles: [],
    projectRoles: { CRAR: 'project-user' },
    allowedProjects: ['CRAR']
  }

  const mockEntra = (
    token,
    { accessToken = 'access-1', refreshToken = 'refresh-1', authorize } = {}
  ) => {
    fetchMock.mockResponse((request) => {
      if (request.url === KEYS_URL) {
        return JSON.stringify(jwks)
      }
      if (request.url === TOKEN_URL) {
        return JSON.stringify({
          id_token: token,
          ...(accessToken && {
            access_token: accessToken,
            ...(refreshToken && { refresh_token: refreshToken }),
            expires_in: 3600
          })
        })
      }
      if (AUTHORIZE_URL.test(request.url)) {
        return {
          status: authorize?.status ?? 200,
          body: JSON.stringify(authorize?.body ?? { user: backendUser })
        }
      }
      return { status: 404, body: '' }
    })
  }

  const callback = (login, query = {}) =>
    server.inject({
      url: `/auth/callback?${new URLSearchParams({ code: 'abc', state: login.state, ...query })}`,
      headers: { cookie: login.cookie }
    })

  test('Should send state, nonce and an S256 PKCE challenge to Entra', async () => {
    const { location, state, nonce } = await startLogin()

    expect(state).toMatch(/^[\w-]{43}$/)
    expect(nonce).toMatch(/^[\w-]{43}$/)
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/)
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
  })

  test('Should sign the user in after a valid callback and send the PKCE verifier', async () => {
    const login = await startLogin('/#/settings')
    mockEntra(await idToken({ nonce: login.nonce }))

    const res = await callback(login)

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/#/settings')
    const tokenCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === TOKEN_URL
    )
    expect(String(tokenCall[1].body)).toContain('code_verifier=')

    const me = await server.inject({
      url: '/api/me',
      headers: { cookie: cookieHeader(res) }
    })
    expect(me.result).toEqual({
      authenticated: true,
      oid: 'user-oid',
      name: 'Ada',
      email: '',
      roles: [],
      projectRoles: { CRAR: 'project-user' },
      allowedProjects: ['CRAR']
    })
  })

  test('Should authorize against the backend with the access token and keep tokens out of /api/me', async () => {
    const login = await startLogin()
    mockEntra(await idToken({ nonce: login.nonce }))

    const res = await callback(login)

    expect(res.statusCode).toBe(302)
    expect(login.location.searchParams.get('scope')).toContain('offline_access')
    const authCall = fetchMock.mock.calls.find(([url]) =>
      AUTHORIZE_URL.test(String(url))
    )
    expect(authCall[1].method).toBe('POST')
    expect(authCall[1].headers.authorization).toBe('Bearer access-1')

    const me = await server.inject({
      url: '/api/me',
      headers: { cookie: cookieHeader(res) }
    })
    expect(me.result).toMatchObject({ authenticated: true, oid: 'user-oid' })
    for (const key of ['accessToken', 'refreshToken', 'expiresAt', 'groups']) {
      expect(me.result).not.toHaveProperty(key)
    }
  })

  test('Should start a fresh session on sign-in', async () => {
    const login = await startLogin()
    mockEntra(await idToken({ nonce: login.nonce }))

    const res = await callback(login)

    expect(cookieHeader(res)).not.toBe(login.cookie)
  })

  test.each([
    ['an access token', { accessToken: null }],
    ['a refresh token', { refreshToken: null }]
  ])(
    'Should refuse sign-in without %s and not fall back to ID token claims',
    async (_, tokens) => {
      const login = await startLogin()
      mockEntra(await idToken({ nonce: login.nonce }), tokens)

      const res = await callback(login)

      expect(res.statusCode).toBe(401)
      const me = await server.inject({
        url: '/api/me',
        headers: { cookie: cookieHeader(res) || login.cookie }
      })
      expect(me.result).toEqual({ authenticated: false })
    }
  )

  test('Should refuse a user the backend has no roles for', async () => {
    const login = await startLogin()
    mockEntra(await idToken({ nonce: login.nonce }), {
      authorize: { status: 403, body: {} }
    })

    const res = await callback(login)

    expect(res.statusCode).toBe(403)
  })

  test('Should refuse sign-in when the authorization service fails', async () => {
    const login = await startLogin()
    mockEntra(await idToken({ nonce: login.nonce }), {
      authorize: { status: 500, body: {} }
    })

    const res = await callback(login)

    expect(res.statusCode).toBe(401)
  })

  test('Should reject a callback whose state does not match', async () => {
    const login = await startLogin()
    mockEntra(await idToken({ nonce: login.nonce }))

    const res = await callback(login, { state: 'forged' })

    expect(res.statusCode).toBe(400)
  })

  test('Should reject a callback without a pending sign-in', async () => {
    const res = await server.inject('/auth/callback?code=abc&state=x')

    expect(res.statusCode).toBe(400)
  })

  test.each([
    ['a wrong nonce', (login) => idToken({ nonce: 'other' })],
    [
      'a wrong audience',
      (login) => idToken({ nonce: login.nonce, aud: 'someone-else' })
    ],
    [
      'a wrong issuer',
      (login) => idToken({ nonce: login.nonce, iss: 'https://evil.example' })
    ],
    [
      'an expired token',
      (login) => idToken({ nonce: login.nonce }, { expiresIn: '-10m' })
    ],
    [
      'a foreign signing key',
      (login) => idToken({ nonce: login.nonce }, { key: foreignKey })
    ]
  ])('Should refuse %s', async (_, build) => {
    const login = await startLogin()
    mockEntra(await build(login))

    const res = await callback(login)

    expect(res.statusCode).toBe(401)
  })

  test('Should refuse a user whose groups overflow the token', async () => {
    const login = await startLogin()
    mockEntra(
      await idToken({ nonce: login.nonce, groups: undefined, hasgroups: true })
    )

    const res = await callback(login)

    expect(res.statusCode).toBe(403)
  })

  test('Should not follow a protocol-relative return address', async () => {
    const login = await startLogin('//evil.example')
    mockEntra(await idToken({ nonce: login.nonce }))

    const res = await callback(login)

    expect(res.headers.location).toBe('/')
  })

  test('Should not reuse a sign-in attempt', async () => {
    const login = await startLogin()
    mockEntra(await idToken({ nonce: login.nonce }))
    const first = await callback(login)
    expect(first.statusCode).toBe(302)

    const replay = await callback(login)

    expect(replay.statusCode).toBe(400)
  })

  test('Should end the Entra session and the local session on logout', async () => {
    const login = await startLogin()
    mockEntra(await idToken({ nonce: login.nonce }))
    const signedIn = await callback(login)
    const cookie = cookieHeader(signedIn)

    const res = await server.inject({ url: '/logout', headers: { cookie } })

    const location = new URL(res.headers.location)
    expect(location.origin + location.pathname).toBe(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/logout`
    )
    expect(location.searchParams.get('post_logout_redirect_uri')).toBe(
      config.get('auth.postLogoutRedirectUri')
    )
    const me = await server.inject({
      url: '/api/me',
      headers: { cookie: cookieHeader(res) || cookie }
    })
    expect(me.result).toEqual({ authenticated: false })
  })

  test('Should ignore a persona request and use Entra when the bypass is off', async () => {
    const res = await server.inject('/login?role=admin')

    expect(res.headers.location).toContain('login.microsoftonline.com')
  })
})

describe('#auth routes with the dev bypass', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should sign in a persona with a dev token and roles from the backend', async () => {
    fetchMock.mockResponse(
      JSON.stringify({
        user: {
          oid: 'dev-project-admin-oid',
          tid: 'dev-tenant',
          name: 'Dev Project Admin',
          email: 'x@example.com',
          roles: [],
          projectRoles: { CRAR: 'project-admin' },
          allowedProjects: ['CRAR']
        }
      })
    )

    const res = await server.inject('/login?role=project-admin&returnTo=/')

    expect(res.statusCode).toBe(302)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.authorization).toMatch(/^Bearer dev-mock\./)
    const me = await server.inject({
      url: '/api/me',
      headers: { cookie: cookieHeader(res) }
    })
    expect(me.result.projectRoles).toEqual({ CRAR: 'project-admin' })
  })

  test('Should fall back to the static persona when the backend is down', async () => {
    fetchMock.mockReject(new Error('ECONNREFUSED'))

    const res = await server.inject('/login?role=user')

    expect(res.statusCode).toBe(302)
    const me = await server.inject({
      url: '/api/me',
      headers: { cookie: cookieHeader(res) }
    })
    expect(me.result).toMatchObject({ authenticated: true, roles: [] })
  })
})

describe('#auth routes without Entra or the bypass', () => {
  let server

  beforeAll(async () => {
    config.set('auth.devBypass', false)
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    config.set('auth.devBypass', true)
    await server.stop({ timeout: 0 })
  })

  test('Should report sign-in as unavailable', async () => {
    const res = await server.inject('/login')

    expect(res.statusCode).toBe(503)
  })

  test('Should not expose the callback', async () => {
    const res = await server.inject('/auth/callback')

    expect(res.statusCode).toBe(404)
  })
})
