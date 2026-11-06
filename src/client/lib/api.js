/**
 * The dashboard is served by its own Hapi backend-for-frontend, which proxies
 * `/api/*` through to mmo-cr-copilot-backend. Every call is therefore
 * same-origin: no backend hostname is baked into the bundle, there is no CORS
 * preflight, and the backend never has to be exposed publicly.
 */
export function apiUrl(path) {
  return path.startsWith('/') ? path : `/${path}`
}

let redirecting = false

/** Sends the browser to sign in again, returning to the current page after. */
export function redirectToLogin() {
  if (redirecting) return
  redirecting = true
  const { pathname, search, hash } = window.location
  const returnTo = encodeURIComponent(`${pathname}${search}${hash}`)
  window.location.assign(`/login?returnTo=${returnTo}`)
}

/**
 * Same-origin request. A 401 means the BFF session has ended (expired, idle or
 * refused), so the user is sent to sign in; the response is still returned.
 */
export async function apiFetch(path, init) {
  const response = await fetch(apiUrl(path), init)
  if (response.status === 401) redirectToLogin()
  return response
}

/**
 * Same-origin write. The BFF rejects any mutating request without
 * `x-requested-with`, which a cross-site form cannot send (CSRF defence).
 */
export function jsonWrite(path, method, body) {
  return apiFetch(path, {
    method,
    headers: {
      Accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
}
