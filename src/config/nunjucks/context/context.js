import { config } from '#/config/config.js'

/**
 * Values available to every rendered template. The dashboard is a single page
 * app, so this is deliberately small — per-page data comes from the controller.
 */
export function context(_request) {
  return {
    assetPath: config.get('assetPath'),
    serviceName: config.get('serviceName'),
    serviceUrl: '/',
    stylesheets: [],
    scripts: []
  }
}
