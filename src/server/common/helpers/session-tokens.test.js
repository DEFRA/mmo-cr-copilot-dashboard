import { config } from '#/config/config.js'
import {
  clearSession,
  getAccessToken,
  saveSignIn,
  sessionTimeoutReason,
  touchSession
} from './session-tokens.js'

const TOKEN_URL = /\/oauth2\/v2\.0\/token$/
const ME_URL = /\/api\/auth\/me$/

const makeRequest = (id = 'session-1') => {
  const store = new Map()
  return {
    app: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    store,
    yar: {
      id,
      get: (key) => store.get(key),
      set: (key, value) => store.set(key, value),
      reset: vi.fn(() => store.clear())
    }
  }
}

const signIn = (request, tokens = {}) =>
  saveSignIn(request, {
    user: { oid: 'u1', roles: [] },
    tokens: {
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 3600000,
      ...tokens
    }
  })

const mockEntra = ({
  token = { access_token: 'at-2', expires_in: 3600 },
  me,
  tokenStatus = 200
} = {}) =>
  fetchMock.mockResponse((req) => {
    if (TOKEN_URL.test(req.url)) {
      return { status: tokenStatus, body: JSON.stringify(token) }
    }
    if (ME_URL.test(req.url)) {
      return JSON.stringify(
        me ?? { user: { oid: 'u1', roles: ['Dashboard.Admin'] } }
      )
    }
    return { status: 404, body: '' }
  })

const tokenCalls = () =>
  fetchMock.mock.calls.filter(([url]) => TOKEN_URL.test(String(url)))

describe('#session-tokens', () => {
  test('Should store user, tokens and meta on sign-in after resetting the session', () => {
    const request = makeRequest()

    signIn(request)

    expect(request.yar.reset).toHaveBeenCalled()
    expect(request.store.get('user')).toEqual({ oid: 'u1', roles: [] })
    expect(request.store.get('tokens').accessToken).toBe('at-1')
    expect(request.store.get('meta')).toHaveProperty('authenticatedAt')
  })

  test('Should reject a session with no tokens', async () => {
    await expect(getAccessToken(makeRequest())).rejects.toMatchObject({
      output: { statusCode: 401 }
    })
  })

  test('Should return a fresh token without any request', async () => {
    const request = makeRequest()
    signIn(request)

    await expect(getAccessToken(request)).resolves.toBe('at-1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should refresh near expiry, store the rotated refresh token and update roles', async () => {
    const request = makeRequest()
    signIn(request, { expiresAt: Date.now() + 60000 })
    mockEntra({
      token: { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 }
    })

    await expect(getAccessToken(request)).resolves.toBe('at-2')

    expect(request.store.get('tokens')).toMatchObject({
      accessToken: 'at-2',
      refreshToken: 'rt-2'
    })
    expect(request.store.get('user').roles).toEqual(['Dashboard.Admin'])
    const meCall = fetchMock.mock.calls.find(([url]) =>
      ME_URL.test(String(url))
    )
    expect(meCall[1].headers.authorization).toBe('Bearer at-2')
  })

  test('Should make one token request for concurrent callers on the same session', async () => {
    const request = makeRequest()
    signIn(request, { expiresAt: Date.now() + 1000 })
    mockEntra()

    const tokens = await Promise.all([
      getAccessToken(request),
      getAccessToken(request),
      getAccessToken(request)
    ])

    expect(tokens).toEqual(['at-2', 'at-2', 'at-2'])
    expect(tokenCalls()).toHaveLength(1)
  })

  test('Should refresh a fresh token when forced', async () => {
    const request = makeRequest()
    signIn(request)
    mockEntra()

    await expect(getAccessToken(request, { forceRefresh: true })).resolves.toBe(
      'at-2'
    )
  })

  test('Should keep the new token when the roles lookup fails', async () => {
    const request = makeRequest()
    signIn(request, { expiresAt: Date.now() + 1000 })
    fetchMock.mockResponse((req) =>
      TOKEN_URL.test(req.url)
        ? JSON.stringify({ access_token: 'at-2', expires_in: 3600 })
        : { status: 500, body: '{}' }
    )

    await expect(getAccessToken(request)).resolves.toBe('at-2')
    expect(request.store.get('user').roles).toEqual([])
  })

  test('Should clear the session and answer 401 when Entra demands re-authentication', async () => {
    const request = makeRequest()
    signIn(request, { expiresAt: Date.now() + 1000 })
    mockEntra({ token: { error: 'invalid_grant' }, tokenStatus: 400 })

    await expect(getAccessToken(request)).rejects.toMatchObject({
      output: { statusCode: 401 }
    })
    expect(request.store.has('tokens')).toBe(false)
  })

  test('Should end the session when there is no refresh token to use', async () => {
    const request = makeRequest()
    signIn(request, { refreshToken: null, expiresAt: Date.now() + 1000 })

    await expect(getAccessToken(request)).rejects.toMatchObject({
      output: { statusCode: 401 }
    })
  })

  test('Should keep using an unexpired token through a transient failure', async () => {
    const request = makeRequest()
    signIn(request, { expiresAt: Date.now() + 100000 })
    mockEntra({ token: {}, tokenStatus: 503 })

    await expect(getAccessToken(request)).resolves.toBe('at-1')
  })

  test('Should answer 502 on a transient failure once the token has expired', async () => {
    const request = makeRequest()
    signIn(request, { expiresAt: Date.now() - 1000 })
    mockEntra({ token: {}, tokenStatus: 503 })

    await expect(getAccessToken(request)).rejects.toMatchObject({
      output: { statusCode: 502 }
    })
  })

  test('Should not log any token value', async () => {
    const request = makeRequest()
    signIn(request, { expiresAt: Date.now() + 1000 })
    mockEntra({ token: { error: 'invalid_grant' }, tokenStatus: 400 })

    await getAccessToken(request).catch(() => {})

    const logged = JSON.stringify([
      ...request.logger.info.mock.calls,
      ...request.logger.warn.mock.calls,
      ...request.logger.error.mock.calls
    ])
    expect(logged).not.toContain('rt-1')
    expect(logged).not.toContain('at-1')
  })

  test('Should use the dev token the auth plugin attached', async () => {
    const request = makeRequest()
    request.app.devAccessToken = 'dev-mock.x'

    await expect(getAccessToken(request)).resolves.toBe('dev-mock.x')
  })

  test('Should clear the session', () => {
    const request = makeRequest()
    signIn(request)

    clearSession(request)

    expect(request.store.size).toBe(0)
  })

  describe('timeouts', () => {
    test('Should report no timeout for a session without meta', () => {
      expect(sessionTimeoutReason(makeRequest())).toBeNull()
    })

    test('Should time out when idle', () => {
      const request = makeRequest()
      signIn(request)
      const later = Date.now() + config.get('session.idleTimeoutMs') + 1000

      expect(sessionTimeoutReason(request, later)).toBe('idle')
    })

    test('Should time out at the absolute limit however active the user is', () => {
      const request = makeRequest()
      signIn(request)
      const later = Date.now() + config.get('session.absoluteTimeoutMs') + 1000
      request.store.set('meta', {
        ...request.store.get('meta'),
        lastActiveAt: later
      })

      expect(sessionTimeoutReason(request, later)).toBe('absolute')
    })

    test('Should write activity at most once a minute', () => {
      const request = makeRequest()
      signIn(request)
      const start = request.store.get('meta').lastActiveWriteAt

      touchSession(request, start + 10000)
      expect(request.store.get('meta').lastActiveAt).toBe(start)

      touchSession(request, start + 61000)
      expect(request.store.get('meta').lastActiveAt).toBe(start + 61000)
    })

    test('Should ignore activity for a session without meta', () => {
      const request = makeRequest()

      touchSession(request)

      expect(request.store.size).toBe(0)
    })
  })
})
