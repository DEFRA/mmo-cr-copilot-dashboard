import { config } from '#/config/config.js'
import { entryAssets } from '#/server/common/helpers/vite-manifest.js'

/**
 * Renders the shell the React dashboard mounts into. Runtime configuration is
 * passed as `data-` attributes rather than an inline script so the
 * Content-Security-Policy can forbid inline script entirely.
 */
export const dashboardController = {
  handler(_request, h) {
    return h.view('dashboard/index', {
      pageTitle: 'Copilot analytics',
      assetPath: config.get('assetPath'),
      pollIntervalMs: config.get('dashboard.pollIntervalMs'),
      sessionCookieName: config.get('session.cache.name'),
      sessionCookieTtlHours: Math.round(
        config.get('session.cookie.ttl') / (60 * 60 * 1000)
      ),
      ...entryAssets()
    })
  }
}
