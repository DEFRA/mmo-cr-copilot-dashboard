import Boom from '@hapi/boom'
import Joi from 'joi'

import { config } from '#/config/config.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { backendRequest } from '#/server/common/helpers/backend-client.js'
import {
  requireIngestToken,
  requireSurvivalToken,
  INGEST_TOKEN_HEADER
} from '#/server/common/helpers/ingest-auth.js'

const MAX_REPOSITORY_LENGTH = 200
const ingestFailure = (reason) => ({
  event: { action: 'ingest', outcome: 'failure', reason }
})

// An OIDC caller may only publish for its own repository, and only once that repository is mapped.
async function assertRepositoryAllowed(request, claims) {
  const repository = request.payload?.repository
  if (repository !== claims.repository) {
    request.logger.warn(
      ingestFailure('repository'),
      'Ingest payload repository does not match the token'
    )
    throw Boom.forbidden('Payload repository does not match the caller')
  }

  const { statusCode, payload } = await backendRequest({
    path: `/api/ingest/repositories/${encodeURIComponent(repository)}`,
    headers: { [INGEST_TOKEN_HEADER]: config.get('ingest.token') },
    logger: request.logger
  })
  if (statusCode === statusCodes.unauthorized) {
    request.logger.error(
      ingestFailure('backend-401'),
      'Backend rejected the ingest token during the repository lookup'
    )
  }
  const mapped = statusCode === statusCodes.ok && payload?.mapped === true
  if (!mapped) {
    request.logger.warn(
      ingestFailure('unmapped'),
      'Ingest payload repository is not mapped to a project'
    )
    throw Boom.forbidden('Repository is not mapped to a project')
  }
}

// Relays the backend's verdict unchanged; a rejection is logged for support.
async function forwardToBackend(request, h, path, what) {
  const { statusCode, payload } = await backendRequest({
    path,
    method: 'POST',
    body: request.payload,
    headers: { [INGEST_TOKEN_HEADER]: config.get('ingest.token') },
    logger: request.logger
  })
  if (statusCode >= statusCodes.badRequest) {
    request.logger.warn(`Backend rejected ${what} with status ${statusCode}`)
  }
  return h.response(payload).code(statusCode)
}

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
    if (request.app.ingestClaims) {
      await assertRepositoryAllowed(request, request.app.ingestClaims)
    }
    return forwardToBackend(request, h, '/api/payloads', 'an ingest payload')
  }
}

const MAX_SURVIVAL_BYTES = 256 * 1024

/**
 * Receives an AI code survival record from the scheduled survival workflow and
 * forwards it to the backend. Only the routing keys are checked here; the
 * backend owns the full contract (backend ADR 0007).
 */
export const survivalController = {
  options: {
    pre: [{ method: requireSurvivalToken }],
    payload: {
      parse: true,
      allow: 'application/json',
      maxBytes: Math.min(
        config.get('ingest.maxPayloadBytes'),
        MAX_SURVIVAL_BYTES
      )
    },
    validate: {
      payload: Joi.object({
        kind: Joi.string().valid('ai-survival').required(),
        repository: Joi.string().max(MAX_REPOSITORY_LENGTH).required(),
        prNumber: Joi.number().integer().min(1).required()
      }).unknown(true)
    }
  },
  handler: async (request, h) => {
    await assertRepositoryAllowed(request, request.app.ingestClaims)
    return forwardToBackend(request, h, '/api/survival', 'a survival record')
  }
}
