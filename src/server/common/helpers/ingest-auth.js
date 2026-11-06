import Boom from '@hapi/boom'

import { config } from '#/config/config.js'
import { IngestTokenError, verifyGithubToken } from './github-oidc.js'
import { isTokenValid } from './verify-token.js'

export const INGEST_TOKEN_HEADER = 'x-ingest-token'
export const INGEST_JTI_SEGMENT = 'ingest-jti'

function reject(request, reason) {
  request.logger.warn(
    {
      event: {
        category: 'authentication',
        action: 'ingest',
        outcome: 'failure',
        reason
      }
    },
    'Rejected ingest request'
  )
  return Boom.unauthorized('Invalid ingest credentials')
}

// Stores each token id until it expires so a captured token cannot be replayed.
async function claimTokenId(request, claims) {
  const cache = request.server.app.ingestJtiCache
  if (!cache) return
  if (await cache.get(claims.jti)) throw reject(request, 'replay')
  const ttl = Math.max(1000, claims.exp * 1000 - Date.now())
  await cache.set(claims.jti, true, ttl)
}

function checkSharedToken(request, h) {
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

/**
 * Guards `POST /api/ingest`. A GitHub Actions OIDC bearer token is verified
 * (dashboard ADR 0003) and its claims kept on `request.app.ingestClaims` for the
 * repository checks in the handler. A caller without a bearer token is refused
 * unless `INGEST_ALLOW_SHARED_TOKEN` is switched on (break-glass, off by default).
 */
export async function requireIngestToken(request, h) {
  const authorization = request.headers.authorization
  if (typeof authorization === 'string' && /^bearer /i.test(authorization)) {
    let claims
    try {
      claims = await verifyGithubToken(authorization.slice(7).trim())
    } catch (err) {
      if (err instanceof IngestTokenError) throw reject(request, err.reason)
      throw err
    }
    await claimTokenId(request, claims)
    request.app.ingestClaims = claims
    return h.continue
  }

  if (config.get('ingest.allowSharedToken') === false) {
    throw reject(request, 'shared-token-disabled')
  }
  return checkSharedToken(request, h)
}

/**
 * Guards `POST /api/ingest/survival`. Only a GitHub Actions OIDC token from the
 * survival workflow is accepted: there is no shared-secret fallback for this
 * route, and an analytics-workflow token is rejected here (and vice versa).
 */
export async function requireSurvivalToken(request, h) {
  const authorization = request.headers.authorization
  if (!(typeof authorization === 'string' && /^bearer /i.test(authorization))) {
    throw reject(request, 'bearer-required')
  }

  let claims
  try {
    claims = await verifyGithubToken(authorization.slice(7).trim(), undefined, {
      workflowRefPrefix: config.get('ingest.oidc.survivalWorkflowRefPrefix'),
      allowedEvents: config
        .get('ingest.oidc.survivalAllowedEvents')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
    })
  } catch (err) {
    if (err instanceof IngestTokenError) throw reject(request, err.reason)
    throw err
  }
  await claimTokenId(request, claims)
  request.app.ingestClaims = claims
  return h.continue
}
