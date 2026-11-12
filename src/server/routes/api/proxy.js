import { STATUS_CODES } from 'node:http'

import Boom from '@hapi/boom'

import { statusCodes } from '#/server/common/constants/status-codes.js'
import { backendRequest } from '#/server/common/helpers/backend-client.js'
import {
  clearSession,
  getAccessToken
} from '#/server/common/helpers/session-tokens.js'

const CSRF_FAILED = 'CSRF validation failed'
const BACKEND_FAILURE = 'The analytics backend could not complete the request'

/**
 * Every mutating request must carry `x-requested-with: XMLHttpRequest`, which a
 * cross-site form cannot set, and any `Origin` it sends must be this host. The
 * host is compared without the scheme because TLS ends at the platform proxy.
 */
export function verifyCsrf(request) {
  if (request.headers['x-requested-with'] !== 'XMLHttpRequest') {
    throw Boom.forbidden(CSRF_FAILED)
  }
  const origin = request.headers.origin
  if (origin === undefined) {
    return
  }
  let originHost
  try {
    originHost = new URL(origin).host
  } catch {
    originHost = null
  }
  if (originHost !== request.info.host) {
    throw Boom.forbidden(CSRF_FAILED)
  }
}

function logAccessDenied(request, resource) {
  request.logger?.warn(
    {
      event: { category: 'iam', action: 'access-denied', reason: resource },
      user: { id: request.user?.oid }
    },
    'Access denied'
  )
}

export function assertAdmin(request) {
  if (!request.user?.roles?.includes('Dashboard.Admin')) {
    logAccessDenied(request, 'admin-role')
    throw Boom.forbidden('Admin role required')
  }
}

// One retry after a token refresh; a second 401 ends the session.
async function sendWithRefresh(request, send) {
  const res = await send(await getAccessToken(request))
  if (res.statusCode !== statusCodes.unauthorized) {
    return res
  }
  request.logger?.info(
    {
      event: {
        category: 'authentication',
        action: 'token-refresh',
        reason: 'backend-401'
      }
    },
    'Retrying after refresh'
  )
  const retried = await send(
    await getAccessToken(request, { forceRefresh: true })
  )
  if (retried.statusCode === statusCodes.unauthorized) {
    clearSession(request)
    throw Boom.unauthorized('Session expired')
  }
  return retried
}

export async function forward(
  request,
  h,
  { path, query, method = 'GET', body }
) {
  const res = await sendWithRefresh(request, (token) =>
    backendRequest({
      path,
      query,
      method,
      body,
      headers: { authorization: `Bearer ${token}` },
      logger: request.logger
    })
  )
  // A 4xx body is the user-facing Boom message; a 5xx body may hold internals.
  if (res.statusCode >= statusCodes.internalServerError) {
    request.logger?.warn(
      { http: { response: { status_code: res.statusCode } } },
      `Backend request failed: ${method} ${path}`
    )
    return h
      .response({
        statusCode: res.statusCode,
        error: STATUS_CODES[res.statusCode] ?? 'Server Error',
        message: BACKEND_FAILURE
      })
      .code(res.statusCode)
  }
  return h.response(res.payload).code(res.statusCode)
}

/** Forwards a CSRF-checked write; `admin` also requires the Dashboard Admin role. */
export function forwardWrite(request, h, target, { admin = false } = {}) {
  verifyCsrf(request)
  if (admin) {
    assertAdmin(request)
  }
  return forward(request, h, {
    method: request.method.toUpperCase(),
    ...target
  })
}

export const projectPath = (request) =>
  `/api/projects/${encodeURIComponent(request.params.slug)}`

export const windowQuery = (request) => ({
  from: request.query.from?.toISOString(),
  to: request.query.to?.toISOString()
})

export const auditQuery = (request) => ({
  ...windowQuery(request),
  page: request.query.page,
  pageSize: request.query.pageSize
})
