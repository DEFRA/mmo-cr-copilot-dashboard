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
      pollIntervalMs: config.get('dashboard.pollIntervalMs'),
      ...entryAssets()
    })
  }
}
