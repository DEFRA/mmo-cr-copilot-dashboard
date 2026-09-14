import Boom from '@hapi/boom'

import { config } from '#/config/config.js'

/**
 * Thin client for mmo-cr-copilot-backend.
 *
 * The backend is an internal CDP service, so requests go direct rather than
 * through the outbound proxy. Only paths this module builds are ever requested
 * — the browser never supplies a backend path — which keeps the proxy from
 * becoming an open redirector.
 */

const JSON_HEADERS = { Accept: 'application/json' }

function buildUrl(baseUrl, path, query) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }

  return url
}

export async function backendRequest(
  { path, method = 'GET', query, body, headers, logger },
  {
    baseUrl = config.get('backend.apiUrl'),
    timeoutMs = config.get('backend.requestTimeoutMs')
  } = {}
) {
  const url = buildUrl(baseUrl, path, query)

  let response
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...JSON_HEADERS,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    logger?.error({ err: error }, `Backend request failed: ${method} ${path}`)
    throw Boom.badGateway('The analytics backend could not be reached')
  }

  const text = await response.text()
  let payload = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch (error) {
      logger?.error(
        { err: error },
        `Backend returned a non-JSON body: ${method} ${path}`
      )
      throw Boom.badGateway(
        'The analytics backend returned an invalid response'
      )
    }
  }

  return { statusCode: response.status, payload }
}
