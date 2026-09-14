import { ingestController } from './controller.js'

/**
 * Ingest endpoint used by the GitHub Actions analytics workflow.
 * Registered in src/server/plugins/router.js.
 */
export const ingest = {
  plugin: {
    name: 'ingest',
    register(server) {
      server.route({
        method: 'POST',
        path: '/api/ingest',
        ...ingestController
      })
    }
  }
}
