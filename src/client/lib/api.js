/**
 * The dashboard is served by its own Hapi backend-for-frontend, which proxies
 * `/api/*` through to mmo-cr-copilot-backend. Every call is therefore
 * same-origin: no backend hostname is baked into the bundle, there is no CORS
 * preflight, and the backend never has to be exposed publicly.
 */
export function apiUrl(path) {
  return path.startsWith('/') ? path : `/${path}`
}
