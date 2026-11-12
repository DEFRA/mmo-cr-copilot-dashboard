import Boom from '@hapi/boom'

import { config } from '#/config/config.js'
import {
  devAccessToken,
  devPersona,
  devSessionUser
} from '#/server/common/helpers/dev-users.js'
import {
  clearSession,
  sessionTimeoutReason,
  touchSession
} from '#/server/common/helpers/session-tokens.js'

export const BACKGROUND_POLL_HEADER = 'x-background-poll'

// Routes opt out of sign-in with `options: { app: { public: true } }`.
export const PUBLIC_ROUTE = { app: { public: true } }

// The Vite middleware in development mounts /public without Hapi route options.
export function isPublicRoute(request) {
  return (
    request.route.settings.app?.public === true ||
    request.path === '/public' ||
    request.path.startsWith('/public/')
  )
}

const asList = (value) => (Array.isArray(value) ? value : [])

function sessionUserFrom(sessionUser) {
  return {
    oid: sessionUser.oid || 'unknown-oid',
    tid: sessionUser.tid || '',
    name: sessionUser.name || 'User',
    email: sessionUser.email || '',
    roles: asList(sessionUser.roles),
    projectRoles:
      sessionUser.projectRoles && typeof sessionUser.projectRoles === 'object'
        ? sessionUser.projectRoles
        : {},
    allowedProjects: asList(sessionUser.allowedProjects)
  }
}

function resolveDevUser(request) {
  const role = request.headers['x-dev-user-role']
  if (role === 'unauthenticated' || role === 'none') {
    return null
  }

  const sessionUser = request.yar?.get?.('user')
  if (sessionUser && !role) {
    return sessionUserFrom(sessionUser)
  }

  const groupsHeader = request.headers['x-dev-user-groups']
  const groups = groupsHeader
    ? groupsHeader
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : undefined
  const persona = devPersona(role ?? 'admin', groups)
  request.app.devAccessToken = devAccessToken(persona)
  return devSessionUser(persona)
}

// Never includes tokens: those are read only through getAccessToken.
function resolveUser(request) {
  if (config.get('auth.devBypass')) {
    return resolveDevUser(request)
  }
  const sessionUser = request.yar?.get?.('user')
  return sessionUser ? sessionUserFrom(sessionUser) : null
}

function rejectUnauthenticated(request, h) {
  if (request.path.startsWith('/api/')) {
    throw Boom.unauthorized('Authentication required')
  }
  const returnTo = encodeURIComponent(request.url.pathname + request.url.search)
  return h.redirect(`/login?returnTo=${returnTo}`).takeover()
}

export const auth = {
  plugin: {
    name: 'auth',
    register(server) {
      server.decorate('request', 'user', null)

      server.ext('onRequest', (request, h) => {
        // Only ingest routes authenticate with a bearer token of their own.
        if (!request.path.startsWith('/api/ingest')) {
          delete request.headers.authorization
        }
        if (!config.get('auth.devBypass')) {
          delete request.headers['x-dev-user-role']
          delete request.headers['x-dev-user-groups']
        }
        return h.continue
      })

      server.ext('onPostAuth', (request, h) => {
        const timedOut = sessionTimeoutReason(request)
        if (timedOut) {
          request.logger?.info(
            {
              event: {
                category: 'authentication',
                action: 'session-end',
                reason: 'session-timeout',
                outcome: timedOut
              }
            },
            'Session timed out'
          )
          clearSession(request)
        }

        request.user = resolveUser(request)
        if (isPublicRoute(request)) {
          return h.continue
        }
        if (!request.user) {
          return rejectUnauthenticated(request, h)
        }

        if (request.headers[BACKGROUND_POLL_HEADER] !== '1') {
          touchSession(request)
        }
        return h.continue
      })
    }
  }
}
