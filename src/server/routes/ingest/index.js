import { config } from '#/config/config.js'
import { INGEST_JTI_SEGMENT } from '#/server/common/helpers/ingest-auth.js'
import { PUBLIC_ROUTE } from '#/server/plugins/auth.js'
import { ingestController, survivalController } from './controller.js'

/**
 * Ingest endpoint used by the GitHub Actions analytics workflow.
 * Registered in src/server/plugins/router.js.
 */
export const ingest = {
  plugin: {
    name: 'ingest',
    register(server) {
      // Shared (Redis) store of used OIDC token ids, so replay is caught across instances.
      server.app.ingestJtiCache = server.cache({
        cache: config.get('session.cache.name'),
        segment: INGEST_JTI_SEGMENT,
        expiresIn: 60 * 60 * 1000
      })
      server.route({
        method: 'POST',
        path: '/api/ingest',
        ...ingestController,
        options: { ...ingestController.options, ...PUBLIC_ROUTE }
      })
      server.route({
        method: 'POST',
        path: '/api/ingest/survival',
        ...survivalController,
        options: { ...survivalController.options, ...PUBLIC_ROUTE }
      })
    }
  }
}
