import { createHash, randomBytes } from 'node:crypto'
import Boom from '@hapi/boom'

import { config } from '#/config/config.js'
import { backendRequest } from '#/server/common/helpers/backend-client.js'
import {
  devAccessToken,
  devPersona,
  devSessionUser
} from '#/server/common/helpers/dev-users.js'
import {
  EntraTokenError,
  endSessionUrl,
  entraSettings,
  exchangeCode,
  requestedScopes,
  verifyIdToken
} from '#/server/common/helpers/entra-client.js'
import {
  clearSession,
  saveSignIn
} from '#/server/common/helpers/session-tokens.js'
import { PUBLIC_ROUTE } from '#/server/plugins/auth.js'

const OIDC_SESSION_KEY = 'oidc'
const GROUP_OVERAGE_MESSAGE =
  'Your account belongs to too many groups for this service to read. Contact the service team.'

const randomToken = () => randomBytes(32).toString('base64url')

const devBypass = () => config.get('auth.devBypass')

/** A same-site path to return to after sign-in; anything else goes home. */
export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

function logSignIn(request, outcome, details = {}) {
  const { reason, userId } = details
  const entry = {
    event: {
      category: 'authentication',
      action: 'sign-in',
      outcome,
      ...(reason && { reason })
    },
    ...(userId && { user: { id: userId } })
  }
  if (outcome === 'success') {
    request.logger?.info(entry, 'User signed in')
  } else {
    request.logger?.warn(entry, 'Sign-in failed')
  }
}

function signInFailure(request, reason, error) {
  logSignIn(request, 'failure', { reason })
  return error
}

// Entra sends `_claim_names.groups` / `hasgroups` instead of the list when a user is in too many groups.
const hasGroupOverage = (claims) =>
  Boolean(claims._claim_names?.groups) || claims.hasgroups === true

// Routes handling Entra ID authentication, sessions, and current user identity.
async function authorizeWithBackend(request, accessToken) {
  return backendRequest({
    path: '/api/auth/authorize',
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    logger: request.logger
  })
}

// Dev personas sign in without Entra; the roles still come from the backend when it is reachable.
async function signInDevPersona(request, role) {
  const persona = devPersona(role)
  const accessToken = devAccessToken(persona)
  let user = devSessionUser(persona)
  try {
    const { statusCode, payload } = await authorizeWithBackend(
      request,
      accessToken
    )
    if (statusCode === 200 && payload?.user) user = payload.user
  } catch (err) {
    request.logger?.warn({ err }, 'Dev sign-in could not reach the backend')
  }
  saveSignIn(request, {
    user,
    tokens: { accessToken, refreshToken: null, expiresAt: null }
  })
}

function tokenExchangeFailure(request, err) {
  if (err instanceof EntraTokenError && err.kind === 'transient') {
    return signInFailure(
      request,
      'token-exchange',
      Boom.badGateway('Sign-in service is unavailable')
    )
  }
  if (err instanceof EntraTokenError && err.kind === 'config') {
    request.logger?.error(
      { event: { category: 'authentication', reason: err.oauthError } },
      'Entra rejected the dashboard client credentials'
    )
  }
  return signInFailure(
    request,
    'token-exchange',
    Boom.unauthorized('Sign-in failed')
  )
}

// Routes handling Entra ID authentication, sessions, and current user identity.
export const authRoutes = [
  {
    method: 'GET',
    path: '/login',
    options: PUBLIC_ROUTE,
    async handler(request, h) {
      const settings = entraSettings()
      const isConfigured = Boolean(settings.tenantId && settings.clientId)

      if (isConfigured && !(devBypass() && request.query?.role)) {
        const state = randomToken()
        const nonce = randomToken()
        const codeVerifier = randomToken()
        const codeChallenge = createHash('sha256')
          .update(codeVerifier)
          .digest('base64url')

        request.yar.set(OIDC_SESSION_KEY, {
          state,
          nonce,
          codeVerifier,
          returnTo: safeReturnTo(request.query?.returnTo)
        })

        const authUrl = new URL(
          `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/authorize`
        )
        authUrl.searchParams.set('client_id', settings.clientId)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('redirect_uri', settings.redirectUri)
        authUrl.searchParams.set('response_mode', 'query')
        authUrl.searchParams.set('scope', requestedScopes(settings))
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('nonce', nonce)
        authUrl.searchParams.set('code_challenge', codeChallenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        return h.redirect(authUrl.toString())
      }

      if (!devBypass()) {
        throw Boom.serverUnavailable('Sign-in is not configured')
      }

      await signInDevPersona(request, request.query?.role)
      return h.redirect(safeReturnTo(request.query?.returnTo))
    }
  },
  {
    method: 'GET',
    path: '/auth/callback',
    options: PUBLIC_ROUTE,
    async handler(request, h) {
      const settings = entraSettings()
      const isConfigured = Boolean(
        settings.tenantId && settings.clientId && settings.clientSecret
      )

      if (!isConfigured) {
        if (!devBypass()) throw Boom.notFound()
        await signInDevPersona(request)
        return h.redirect('/')
      }

      const pending = request.yar.get(OIDC_SESSION_KEY)
      request.yar.clear(OIDC_SESSION_KEY)

      if (request.query?.error) {
        throw signInFailure(
          request,
          'provider-error',
          Boom.unauthorized('Sign-in was not completed')
        )
      }
      if (
        !pending ||
        !request.query?.state ||
        request.query.state !== pending.state
      ) {
        throw signInFailure(
          request,
          'state',
          Boom.badRequest('Sign-in could not be verified')
        )
      }
      if (!request.query?.code) {
        throw signInFailure(
          request,
          'code',
          Boom.badRequest('Sign-in could not be verified')
        )
      }

      let tokens
      try {
        tokens = await exchangeCode(settings, {
          code: request.query.code,
          codeVerifier: pending.codeVerifier
        })
      } catch (err) {
        throw tokenExchangeFailure(request, err)
      }

      let claims
      try {
        claims = await verifyIdToken(tokens.idToken, settings)
      } catch (err) {
        request.logger?.error({ err }, 'ID token verification failed')
        throw signInFailure(
          request,
          'id-token',
          Boom.unauthorized('Sign-in failed')
        )
      }

      if (claims.nonce !== pending.nonce) {
        throw signInFailure(
          request,
          'nonce',
          Boom.unauthorized('Sign-in failed')
        )
      }
      if (hasGroupOverage(claims)) {
        throw signInFailure(
          request,
          'group-overage',
          Boom.forbidden(GROUP_OVERAGE_MESSAGE)
        )
      }

      if (!tokens.accessToken || !tokens.refreshToken) {
        throw signInFailure(
          request,
          'no-access-token',
          Boom.unauthorized('Sign-in failed')
        )
      }

      const backendRes = await authorizeWithBackend(request, tokens.accessToken)
      if (backendRes.statusCode === 403) {
        throw signInFailure(
          request,
          'access-denied',
          Boom.forbidden('No assigned roles in this application')
        )
      }
      if (backendRes.statusCode !== 200 || !backendRes.payload?.user) {
        throw signInFailure(
          request,
          'backend-auth',
          Boom.unauthorized('Sign-in failed at authorization service')
        )
      }

      const user = backendRes.payload.user
      saveSignIn(request, {
        user,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        }
      })
      logSignIn(request, 'success', { userId: user.oid })
      return h.redirect(safeReturnTo(pending.returnTo))
    }
  },
  {
    // GET so a plain link works; the redirect only ends this user's own session.
    method: 'GET',
    path: '/logout',
    options: PUBLIC_ROUTE,
    handler(request, h) {
      clearSession(request)
      const settings = entraSettings()
      if (!devBypass() && settings.tenantId && settings.clientId) {
        return h.redirect(endSessionUrl(settings))
      }
      return h.redirect('/')
    }
  },
  {
    method: 'GET',
    path: '/api/me',
    options: PUBLIC_ROUTE,
    handler(request, h) {
      if (!request.user) return h.response({ authenticated: false })
      const { oid, name, email, roles, projectRoles, allowedProjects } =
        request.user
      return h.response({
        authenticated: true,
        oid,
        name,
        email,
        roles,
        projectRoles,
        allowedProjects
      })
    }
  }
]
