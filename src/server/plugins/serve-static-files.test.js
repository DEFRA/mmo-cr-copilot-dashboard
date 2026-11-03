import { createServer } from '#/server/server.js'

describe('#serveStaticFiles', () => {
  let server

  describe('When secure context is disabled', () => {
    // initialize() rather than start(): binding the real port makes this fail
    // whenever a dev server is already running on it.
    beforeEach(async () => {
      server = await createServer()
      await server.initialize()
    })

    afterEach(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Should redirect the favicon to the Defra favicon', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/favicon.ico'
      })

      expect(statusCode).toBe(301)
      expect(headers.location).toBe('/public/images/favicon.ico')
    })
  })
})
