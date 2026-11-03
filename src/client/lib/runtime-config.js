/**
 * Runtime configuration handed to the browser by the Hapi server.
 *
 * Values are read from `data-` attributes on the React root element rather than
 * an inline `<script>` so the app stays compatible with a strict
 * Content-Security-Policy that forbids inline script.
 */

const DEFAULT_POLL_INTERVAL_MS = 15_000
const DEFAULT_SESSION_TTL_HOURS = 8

export function readRuntimeConfig(element) {
  const root =
    element ??
    (typeof document === 'undefined' ? null : document.getElementById('root'))

  const pollIntervalMs = Number(root?.dataset?.pollIntervalMs)
  const cookieTtlHours = Number(root?.dataset?.sessionCookieTtlHours)

  return {
    pollIntervalMs:
      Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
        ? pollIntervalMs
        : DEFAULT_POLL_INTERVAL_MS,
    serviceName: root?.dataset?.serviceName || 'Copilot Analytics Dashboard',
    sessionCookieName: root?.dataset?.sessionCookieName || 'session',
    sessionCookieTtlHours:
      Number.isFinite(cookieTtlHours) && cookieTtlHours > 0
        ? cookieTtlHours
        : DEFAULT_SESSION_TTL_HOURS
  }
}
