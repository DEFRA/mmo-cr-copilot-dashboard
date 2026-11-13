import { createRemoteJWKSet, jwtVerify } from 'jose'

import { config } from '#/config/config.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const LOGIN_HOST = 'https://login.microsoftonline.com'
const REAUTH_ERRORS = new Set(['invalid_grant', 'interaction_required'])
const CONFIG_ERRORS = new Set(['invalid_client', 'unauthorized_client'])

/**
 * `kind` tells the caller what to do: `reauth` sends the user to sign in
 * again, `transient` may be retried, `config` is a deployment fault. The
 * response body is never logged or attached; only the OAuth error code is.
 */
export class EntraTokenError extends Error {
  constructor(kind, oauthError) {
    super(`Entra token request failed: ${kind}`)
    this.name = 'EntraTokenError'
    this.kind = kind
    this.oauthError = oauthError ?? null
  }
}

// One cached key set per tenant; jose refreshes it when an unknown `kid` arrives.
const jwksByTenant = new Map()

function jwksFor(tenantId) {
  if (!jwksByTenant.has(tenantId)) {
    jwksByTenant.set(
      tenantId,
      createRemoteJWKSet(
        new URL(`${LOGIN_HOST}/${tenantId}/discovery/v2.0/keys`)
      )
    )
  }
  return jwksByTenant.get(tenantId)
}

export function entraSettings() {
  return {
    tenantId: config.get('auth.entraTenantId'),
    clientId: config.get('auth.entraClientId'),
    clientSecret: config.get('auth.entraClientSecret'),
    redirectUri: config.get('auth.redirectUri'),
    backendClientId: config.get('auth.entraBackendClientId'),
    backendScope: config.get('auth.entraBackendScope'),
    postLogoutRedirectUri: config.get('auth.postLogoutRedirectUri'),
    timeoutMs: config.get('auth.tokenEndpointTimeoutMs')
  }
}

export function requestedScopes({ backendClientId, backendScope }) {
  const audience = backendClientId?.startsWith('api://')
    ? backendClientId
    : `api://${backendClientId}`
  const backendScopeUri = backendClientId ? `${audience}/${backendScope}` : null
  return ['openid', 'profile', 'email', 'offline_access', backendScopeUri]
    .filter(Boolean)
    .join(' ')
}

const expiresAtFrom = (expiresIn) =>
  Number.isFinite(Number(expiresIn)) && Number(expiresIn) > 0
    ? Date.now() + Number(expiresIn) * 1000
    : null

async function postToken(settings, params) {
  let res
  try {
    res = await fetch(`${LOGIN_HOST}/${settings.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        ...params
      }).toString(),
      signal: AbortSignal.timeout(settings.timeoutMs ?? 10000)
    })
  } catch {
    throw new EntraTokenError('transient', 'network_error')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const oauthError = typeof data?.error === 'string' ? data.error : null
    if (REAUTH_ERRORS.has(oauthError)) {
      throw new EntraTokenError('reauth', oauthError)
    }
    if (CONFIG_ERRORS.has(oauthError)) {
      throw new EntraTokenError('config', oauthError)
    }
    if (
      res.status >= statusCodes.internalServerError ||
      oauthError === 'temporarily_unavailable'
    ) {
      throw new EntraTokenError('transient', oauthError)
    }
    throw new EntraTokenError('reauth', oauthError)
  }
  return data ?? {}
}

export async function exchangeCode(settings, { code, codeVerifier }) {
  const data = await postToken(settings, {
    code,
    code_verifier: codeVerifier,
    redirect_uri: settings.redirectUri,
    scope: requestedScopes(settings),
    grant_type: 'authorization_code'
  })
  if (typeof data.id_token !== 'string') {
    throw new EntraTokenError('reauth', 'missing_id_token')
  }
  return {
    idToken: data.id_token,
    accessToken: data.access_token ?? null,
    refreshToken: data.refresh_token ?? null,
    expiresAt: expiresAtFrom(data.expires_in)
  }
}

export async function refreshTokens(settings, refreshToken) {
  const data = await postToken(settings, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: requestedScopes(settings)
  })
  if (typeof data.access_token !== 'string') {
    throw new EntraTokenError('transient', 'missing_access_token')
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: expiresAtFrom(data.expires_in)
  }
}

export async function verifyIdToken(idToken, { tenantId, clientId }) {
  const { payload } = await jwtVerify(idToken, jwksFor(tenantId), {
    issuer: `${LOGIN_HOST}/${tenantId}/v2.0`,
    audience: clientId,
    algorithms: ['RS256'],
    clockTolerance: 60
  })
  return payload
}

export function endSessionUrl({ tenantId, postLogoutRedirectUri }) {
  const url = new URL(`${LOGIN_HOST}/${tenantId}/oauth2/v2.0/logout`)
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)
  return url.toString()
}
