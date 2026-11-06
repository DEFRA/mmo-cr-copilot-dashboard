import { config } from '#/config/config.js'

export const serveStaticFiles = {
  plugin: {
    name: 'staticFiles',
    register(server) {
      server.route([
        {
          options: {
            auth: false,
            app: { public: true },
            cache: {
              expiresIn: config.get('staticCacheTimeout'),
              privacy: 'private'
            }
          },
          method: 'GET',
          path: '/favicon.ico',
          handler(_request, h) {
            return h
              .redirect(`${config.get('assetPath')}/images/favicon.ico`)
              .permanent()
          }
        },
        {
          options: {
            auth: false,
            app: { public: true },
            cache: {
              expiresIn: config.get('staticCacheTimeout'),
              privacy: 'private'
            }
          },
          method: 'GET',
          path: `${config.get('assetPath')}/{param*}`,
          handler: {
            directory: {
              path: '.',
              redirectToSlash: true
            }
          }
        }
      ])
    }
  }
}
