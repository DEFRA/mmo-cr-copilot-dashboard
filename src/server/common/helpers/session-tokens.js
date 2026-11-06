import Boom from '@hapi/boom'

import { config } from '#/config/config.js'
import { backendRequest } from '#/server/common/helpers/backend-client.js'
import {
  EntraTokenError,
  entraSettings,
  refreshTokens
} from '#/server/common/helpers/entra-client.js'

const USER_KEY = 'user'
const TOKENS_KEY = 'tokens'
const META_KEY = 'meta'
const ACTIVITY_WRITE_INTERVAL_MS = 60000

// One refresh per session per instance. Instances may refresh concurrently:
// Entra does not revoke the previous refresh token on use, so the last write wins.
const inflight = new Map()

export function saveSignIn(request, { user, tokens }) {
  const now = Date.now()
  request.yar.reset()
  request.yar.set(USER_KEY, user)
  request.yar.set(TOKENS_KEY, tokens)
  request.yar.set(META_KEY, {
    authenticatedAt: now,
    lastActiveAt: now,
    lastActiveWriteAt: now
  })
}

export const getTokens = (request) => request.yar?.get?.(TOKENS_KEY) ?? null

export function clearSession(request) {
  request.yar.reset()
}

/** Records user activity, writing to the session store at most once a minute. */
export function touchSession(request, now = Date.now()) {
  const meta = request.yar.get(META_KEY)
  if (
    !meta ||
    now - (meta.lastActiveWriteAt ?? 0) < ACTIVITY_WRITE_INTERVAL_MS
  ) {
    return
  }
  request.yar.set(META_KEY, {
    ...meta,
    lastActiveAt: now,
    lastActiveWriteAt: now
  })
}

/** Returns the reason the session has timed out, or null while it is valid. */
export function sessionTimeoutReason(request, now = Date.now()) {
  const meta = request.yar?.get?.(META_KEY)
  if (!meta) return null
  if (now - meta.authenticatedAt > config.get('session.absoluteTimeoutMs')) {
    return 'absolute'
  }
  if (now - meta.lastActiveAt > config.get('session.idleTimeoutMs')) {
    return 'idle'
  }
  return null
}

const isFresh = (tokens, now) =>
  !tokens.expiresAt ||
  tokens.expiresAt - now > config.get('auth.tokenRefreshSkewMs')

async function refreshSession(request, tokens) {
  const refreshed = await refreshTokens(entraSettings(), tokens.refreshToken)
  request.yar.set(TOKENS_KEY, refreshed)

  // Roles may have changed; pick them up with the new token.
  try {
    const { statusCode, payload } = await backendRequest({
      path: '/api/auth/me',
      headers: { authorization: `Bearer ${refreshed.accessToken}` },
      logger: request.logger
    })
    if (statusCode === 200 && payload?.user) {
      request.yar.set(USER_KEY, payload.user)
    }
  } catch (err) {
    request.logger?.warn({ err }, 'Could not refresh roles after token refresh')
  }
  request.logger?.info(
    { event: { category: 'authentication', action: 'token-refresh' } },
    'Access token refreshed'
  )
  return refreshed
}

/**
 * The current access token for the session, refreshed first when it is close
 * to expiry or when the caller knows the backend rejected it.
 */
export async function getAccessToken(request, { forceRefresh = false } = {}) {
  // Set by the auth plugin only when the explicit dev bypass supplies the user.
  if (request.app?.devAccessToken) return request.app.devAccessToken

  const tokens = getTokens(request)
  if (!tokens?.accessToken) throw Boom.unauthorized('Authentication required')

  const now = Date.now()
  if (!forceRefresh && isFresh(tokens, now)) return tokens.accessToken

  if (!tokens.refreshToken) {
    clearSession(request)
    throw Boom.unauthorized('Session expired')
  }

  const key = request.yar.id
  let pending = inflight.get(key)
  if (!pending) {
    pending = refreshSession(request, tokens).finally(() =>
      inflight.delete(key)
    )
    inflight.set(key, pending)
  }

  try {
    const refreshed = await pending
    request.yar.set(TOKENS_KEY, refreshed)
    return refreshed.accessToken
  } catch (err) {
    if (!(err instanceof EntraTokenError)) throw err
    request.logger?.warn(
      {
        event: {
          category: 'authentication',
          action: 'token-refresh',
          outcome: 'failure',
          reason: `refresh-${err.kind}`
        }
      },
      'Token refresh failed'
    )
    if (err.kind === 'reauth') {
      clearSession(request)
      throw Boom.unauthorized('Session expired')
    }
    if (
      err.kind === 'transient' &&
      !forceRefresh &&
      tokens.expiresAt > Date.now()
    ) {
      return tokens.accessToken
    }
    throw Boom.badGateway('Sign-in service is unavailable')
  }
}
