import Boom from '@hapi/boom'

import { config } from '#/config/config.js'
import { isTokenValid } from './verify-token.js'

export const INGEST_TOKEN_HEADER = 'x-ingest-token'

/**
 * Guards `POST /api/ingest` with the shared secret the GitHub Actions workflow
 * presents. The same secret is forwarded to the backend, so one value is
 * injected into the workflow, this service, and the backend. When no token is
 * configured the check is skipped so local development works without secrets;
 * CDP environments always inject one.
 */
export function requireIngestToken(request, h) {
  const expected = config.get('ingest.token')

  if (!expected) {
    request.logger.warn(
      'INGEST_TOKEN is not set — accepting ingest requests without authentication'
    )
    return h.continue
  }

  if (!isTokenValid(request.headers[INGEST_TOKEN_HEADER], expected)) {
    request.logger.warn(
      'Rejected ingest request with a missing or invalid token'
    )
    throw Boom.unauthorized('Invalid ingest token')
  }

  return h.continue
}
