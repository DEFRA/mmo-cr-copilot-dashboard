import { createRemoteJWKSet, jwtVerify } from 'jose'

import { config } from '#/config/config.js'

export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'

const jwks = createRemoteJWKSet(
  new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`)
)

export class IngestTokenError extends Error {
  constructor(reason) {
    super(`GitHub OIDC token rejected: ${reason}`)
    this.reason = reason
  }
}

const splitList = (value) =>
  value
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

const allowedEvents = () => splitList(config.get('ingest.oidc.allowedEvents'))

/**
 * Verifies a GitHub Actions OIDC token (dashboard ADR 0003): signature, issuer,
 * audience and lifetime, then that it came from the DEFRA organisation, through
 * one of the expected workflows, on an allowed event. Returns the claims. The
 * workflows and events default to the analytics and backfill workflows; the
 * survival route passes its own.
 */
export async function verifyGithubToken(token, keySet = jwks, options = {}) {
  let payload
  try {
    ;({ payload } = await jwtVerify(token, keySet, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: config.get('ingest.oidc.audience'),
      algorithms: ['RS256'],
      clockTolerance: 30
    }))
  } catch (err) {
    throw new IngestTokenError(err.code ?? 'invalid')
  }

  const ownerId = config.get('ingest.oidc.ownerId')
  if (!ownerId || String(payload.repository_owner_id) !== ownerId) {
    throw new IngestTokenError('owner')
  }
  const workflowRef = String(payload.job_workflow_ref ?? '')
  const prefixes = splitList(
    options.workflowRefPrefix ?? config.get('ingest.oidc.workflowRefPrefix')
  )
  if (!prefixes.some((prefix) => workflowRef.startsWith(prefix))) {
    throw new IngestTokenError('workflow')
  }
  const events = options.allowedEvents ?? allowedEvents()
  if (!events.includes(payload.event_name)) {
    throw new IngestTokenError('event')
  }
  if (typeof payload.jti !== 'string' || !payload.jti) {
    throw new IngestTokenError('jti')
  }
  return payload
}
