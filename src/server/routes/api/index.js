import { apiProxyRoutes } from './controller.js'

/**
 * Backend-for-frontend proxy for the dashboard's read APIs.
 * Registered in src/server/plugins/router.js.
 */
export const api = {
  plugin: {
    name: 'api',
    register(server) {
      server.route(apiProxyRoutes)
    }
  }
}
