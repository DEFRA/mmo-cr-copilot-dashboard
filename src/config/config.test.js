/**
 * The guard runs at module load, so each case needs a fresh module registry
 * with the environment already in place.
 */
const loadConfig = async (env) => {
  vi.resetModules()

  const previous = { ...process.env }
  Object.assign(process.env, env)

  try {
    return await import('./config.js')
  } finally {
    process.env = previous
  }
}

const deployed = {
  ENVIRONMENT: 'prod',
  INGEST_TOKEN: 'a-real-secret',
  SESSION_COOKIE_PASSWORD: 'another-secret-at-least-32-characters',
  ENTRA_TENANT_ID: '11111111-2222-3333-4444-555555555555',
  ENTRA_CLIENT_ID: '22222222-2222-3333-4444-555555555555',
  ENTRA_CLIENT_SECRET: 'client-secret',
  ENTRA_BACKEND_CLIENT_ID: '33333333-2222-3333-4444-555555555555',
  ENTRA_REDIRECT_URI: 'https://dashboard.example/auth/callback',
  ENTRA_POST_LOGOUT_REDIRECT_URI: 'https://dashboard.example/'
}

describe('#config required secrets', () => {
  test('Should allow the shipped defaults in local development', async () => {
    await expect(loadConfig({ ENVIRONMENT: 'local' })).resolves.toBeDefined()
  })

  test('Should refuse to start a deployed environment without INGEST_TOKEN', async () => {
    await expect(loadConfig({ ...deployed, INGEST_TOKEN: '' })).rejects.toThrow(
      'INGEST_TOKEN'
    )
  })

  test('Should refuse to start when the session cookie password is the shipped default', async () => {
    await expect(
      loadConfig({
        ...deployed,
        SESSION_COOKIE_PASSWORD:
          'the-password-must-be-at-least-32-characters-long'
      })
    ).rejects.toThrow('SESSION_COOKIE_PASSWORD')
  })

  test.each([
    'ENTRA_TENANT_ID',
    'ENTRA_CLIENT_ID',
    'ENTRA_CLIENT_SECRET',
    'ENTRA_BACKEND_CLIENT_ID'
  ])(
    'Should refuse to start a deployed environment without %s',
    async (name) => {
      await expect(loadConfig({ ...deployed, [name]: '' })).rejects.toThrow(
        name
      )
    }
  )

  test.each(['ENTRA_REDIRECT_URI', 'ENTRA_POST_LOGOUT_REDIRECT_URI'])(
    'Should refuse a deployed %s that is not https',
    async (name) => {
      await expect(
        loadConfig({ ...deployed, [name]: 'http://dashboard.example/' })
      ).rejects.toThrow('https')
    }
  )

  test('Should start a deployed environment once both secrets are supplied', async () => {
    await expect(loadConfig(deployed)).resolves.toBeDefined()
  })
})

describe('#config auth safety', () => {
  test.each(['dev', 'test', 'prod'])(
    'Should refuse the dev bypass in the %s environment',
    async (ENVIRONMENT) => {
      await expect(
        loadConfig({
          ...deployed,
          ENVIRONMENT,
          NODE_ENV: 'production',
          AUTH_DEV_BYPASS: 'true'
        })
      ).rejects.toThrow('AUTH_DEV_BYPASS')
    }
  )

  test('Should allow the dev bypass locally', async () => {
    const { config } = await loadConfig({
      ENVIRONMENT: 'local',
      AUTH_DEV_BYPASS: 'true'
    })

    expect(config.get('auth.devBypass')).toBe(true)
  })

  test('Should refuse an absolute timeout shorter than the idle timeout', async () => {
    await expect(
      loadConfig({
        ENVIRONMENT: 'local',
        SESSION_IDLE_TIMEOUT_MS: '3600000',
        SESSION_ABSOLUTE_TIMEOUT_MS: '1800000'
      })
    ).rejects.toThrow('SESSION_ABSOLUTE_TIMEOUT_MS')
  })

  test('Should refuse a session cache that expires before the absolute timeout', async () => {
    await expect(
      loadConfig({ ENVIRONMENT: 'local', SESSION_CACHE_TTL: '1000' })
    ).rejects.toThrow('SESSION_CACHE_TTL')
  })

  test('Should default to a 30 minute idle and 8 hour absolute timeout', async () => {
    const { config } = await loadConfig({ ENVIRONMENT: 'local' })

    expect(config.get('session.idleTimeoutMs')).toBe(1800000)
    expect(config.get('session.absoluteTimeoutMs')).toBe(28800000)
  })

  test('Should redact credentials in every environment', async () => {
    const { config } = await loadConfig({ ENVIRONMENT: 'local' })

    expect(config.get('log.redact')).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-ingest-token"]'
      ])
    )
  })
})
