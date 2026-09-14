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
  SESSION_COOKIE_PASSWORD: 'another-secret-at-least-32-characters'
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

  test('Should start a deployed environment once both secrets are supplied', async () => {
    await expect(loadConfig(deployed)).resolves.toBeDefined()
  })
})
