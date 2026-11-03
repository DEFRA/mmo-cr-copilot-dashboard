import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { saveSignIn } from '#/server/common/helpers/session-tokens.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const cookieHeader = (res) =>
  (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ')

const USER = {
  oid: 'u1',
  tid: 't1',
  name: 'Ada',
  email: 'ada@example.com',
  roles: ['Dashboard.Admin'],
  projectRoles: { CRAR: 'project-admin' },
  allowedProjects: ['CRAR']
}

describe('#auth plugin', () => {
  let server

  beforeAll(async () => {
    config.set('auth.devBypass', false)
    server = await createServer()
    server.route([
      {
        method: 'GET',
        path: '/test/sign-in',
        options: { app: { public: true } },
        handler: (request, h) => {
          saveSignIn(request, {
            user: USER,
            tokens: {
              accessToken: 'at-1',
              refreshToken: 'rt-1',
              expiresAt: Date.now() + 3600000
            }
          })
          return h.response('ok')
        }
      },
      {
        method: 'GET',
        path: '/api/test/whoami',
        handler: (request, h) =>
          h.response({
            user: request.user,
            authorization: request.headers.authorization ?? null,
            devRole: request.headers['x-dev-user-role'] ?? null
          })
      }
    ])
    await server.initialize()
  })

  afterAll(async () => {
    config.set('auth.devBypass', true)
    await server.stop({ timeout: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const signIn = async () => cookieHeader(await server.inject('/test/sign-in'))

  test('Should expose roles, project roles and allowed projects but no tokens', async () => {
    const cookie = await signIn()

    const { result } = await server.inject({
      url: '/api/test/whoami',
      headers: { cookie }
    })

    expect(result.user).toEqual(USER)
    expect(JSON.stringify(result.user)).not.toMatch(/at-1|rt-1|accessToken/)
  })

  test('Should answer 401 for an API call and redirect a page without a session', async () => {
    const api = await server.inject('/api/test/whoami')
    const page = await server.inject('/?x=1')

    expect(api.statusCode).toBe(statusCodes.unauthorized)
    expect(page.statusCode).toBe(302)
    expect(page.headers.location).toBe('/login?returnTo=%2F%3Fx%3D1')
  })

  test.each(['/health', '/api/me', '/login'])(
    'Should leave %s public',
    async (url) => {
      const { statusCode } = await server.inject(url)

      expect(statusCode).not.toBe(statusCodes.unauthorized)
    }
  )

  test('Should mark both ingest routes public so GitHub callers reach their own token check', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url: '/api/ingest/survival',
      payload: {}
    })

    expect(statusCode).not.toBe(302)
    for (const path of ['/api/ingest', '/api/ingest/survival']) {
      const route = server.table().find((r) => r.path === path)
      expect(route.settings.app.public).toBe(true)
    }
  })

  test('Should ignore dev headers when the bypass is off', async () => {
    const { result, statusCode } = await server.inject({
      url: '/api/test/whoami',
      headers: { 'x-dev-user-role': 'admin' }
    })

    expect(statusCode).toBe(statusCodes.unauthorized)
    expect(result).not.toHaveProperty('user')
  })

  test('Should strip a browser Authorization header from non-ingest routes', async () => {
    const cookie = await signIn()

    const { result } = await server.inject({
      url: '/api/test/whoami',
      headers: { cookie, authorization: 'Bearer browser' }
    })

    expect(result.authorization).toBeNull()
  })

  test('Should end the session after the idle timeout', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const cookie = await signIn()
    vi.setSystemTime(Date.now() + config.get('session.idleTimeoutMs') + 1000)

    const { statusCode } = await server.inject({
      url: '/api/test/whoami',
      headers: { cookie }
    })

    expect(statusCode).toBe(statusCodes.unauthorized)
  })

  test('Should end the session at the absolute limit even when active', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const cookie = await signIn()
    const step = config.get('session.idleTimeoutMs') - 1000
    let statusCode = 200
    for (
      let elapsed = 0;
      elapsed <= config.get('session.absoluteTimeoutMs') + step;
      elapsed += step
    ) {
      vi.setSystemTime(Date.now() + step)
      ;({ statusCode } = await server.inject({
        url: '/api/test/whoami',
        headers: { cookie }
      }))
      if (statusCode !== 200) break
    }

    expect(statusCode).toBe(statusCodes.unauthorized)
  })

  test('Should not let background polls keep an idle session alive', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const cookie = await signIn()
    const idle = config.get('session.idleTimeoutMs')

    vi.setSystemTime(Date.now() + idle - 5000)
    const poll = await server.inject({
      url: '/api/test/whoami',
      headers: { cookie, 'x-background-poll': '1' }
    })
    vi.setSystemTime(Date.now() + 10000)
    const next = await server.inject({
      url: '/api/test/whoami',
      headers: { cookie }
    })

    expect(poll.statusCode).toBe(statusCodes.ok)
    expect(next.statusCode).toBe(statusCodes.unauthorized)
  })

  test('Should extend an idle session on user activity', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const cookie = await signIn()
    const idle = config.get('session.idleTimeoutMs')

    vi.setSystemTime(Date.now() + idle - 5000)
    await server.inject({ url: '/api/test/whoami', headers: { cookie } })
    vi.setSystemTime(Date.now() + 10000)
    const next = await server.inject({
      url: '/api/test/whoami',
      headers: { cookie }
    })

    expect(next.statusCode).toBe(statusCodes.ok)
  })
})

describe('#auth plugin with the dev bypass', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should use the admin persona without a session', async () => {
    const { result } = await server.inject('/api/me')

    expect(result).toMatchObject({ authenticated: true, oid: 'dev-admin-oid' })
  })

  test.each(['none', 'unauthenticated'])(
    'Should treat the %s persona as signed out',
    async (role) => {
      const { result } = await server.inject({
        url: '/api/me',
        headers: { 'x-dev-user-role': role }
      })

      expect(result).toEqual({ authenticated: false })
    }
  )

  test('Should honour a persona header', async () => {
    const { result } = await server.inject({
      url: '/api/me',
      headers: { 'x-dev-user-role': 'project-admin' }
    })

    expect(result.oid).toBe('dev-project-admin-oid')
    expect(result.roles).toEqual([])
  })
})
