import { dashboardController } from './controller.js'

/**
 * Serves the dashboard shell. The app is a single page with client-side
 * navigation, so the root path is the only entry point; unknown paths fall
 * through to the standard error page rather than silently rendering the app.
 */
export const dashboard = {
  plugin: {
    name: 'dashboard',
    register(server) {
      server.route({
        method: 'GET',
        path: '/',
        ...dashboardController
      })
    }
  }
}
