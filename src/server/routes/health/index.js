import { PUBLIC_ROUTE } from '#/server/plugins/auth.js'
import { healthController } from './controller.js'

export const health = {
  plugin: {
    name: 'health',
    register(server) {
      server.route({
        method: 'GET',
        path: '/health',
        ...healthController,
        options: { ...healthController.options, ...PUBLIC_ROUTE }
      })
    }
  }
}
