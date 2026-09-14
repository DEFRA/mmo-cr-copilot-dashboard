import { config } from '#/config/config.js'
import { backendRequest } from '#/server/common/helpers/backend-client.js'
import {
  requireIngestToken,
  INGEST_TOKEN_HEADER
} from '#/server/common/helpers/ingest-auth.js'

/**
 * Receives an analytics payload from the GitHub Actions workflow and forwards
 * it to the backend, which validates and persists it.
 *
 * Validation deliberately lives in the backend so there is a single source of
 * truth for the payload contract; this service authenticates the caller, caps
 * the body size, and relays the backend's verdict unchanged.
 */
export const ingestController = {
  options: {
    pre: [{ method: requireIngestToken }],
    payload: {
      parse: true,
      allow: 'application/json',
      maxBytes: config.get('ingest.maxPayloadBytes')
    }
  },
  handler: async (request, h) => {
    const { statusCode, payload } = await backendRequest({
      path: '/api/payloads',
      method: 'POST',
      body: request.payload,
      headers: { [INGEST_TOKEN_HEADER]: config.get('ingest.token') },
      logger: request.logger
    })

    if (statusCode >= 400) {
      request.logger.warn(
        `Backend rejected an ingest payload with status ${statusCode}`
      )
    }

    return h.response(payload).code(statusCode)
  }
}
