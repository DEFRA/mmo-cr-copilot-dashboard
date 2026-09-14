import Blankie from 'blankie'

import { config } from '#/config/config.js'

const isDevelopment = !config.get('isProduction') && !config.get('isTest')

/**
 * Content security policy for the React dashboard.
 *
 * `script-src` stays free of 'unsafe-inline' and 'unsafe-eval': runtime config
 * reaches the app through `data-` attributes, and the React Fast Refresh
 * preamble is served as a module rather than inlined.
 *
 * `style-src` must allow inline styles because ECharts writes them directly
 * onto the chart container and tooltip elements. That is a property of the
 * charting library, not of application code.
 *
 * @satisfies {import('@hapi/hapi').Plugin}
 */
const contentSecurityPolicy = {
  plugin: Blankie,
  options: {
    defaultSrc: ['self'],
    fontSrc: ['self', 'data:'],
    // Same-origin polling only; the backend is reached through this server.
    // Vite's dev server pushes hot updates over a websocket to this origin.
    connectSrc: isDevelopment ? ['self', 'ws:', 'wss:'] : ['self'],
    mediaSrc: ['self'],
    // Required by ECharts, which sets inline styles on charts and tooltips.
    styleSrc: ['self', 'unsafe-inline'],
    scriptSrc: ['self'],
    // 'blob:' covers ECharts' canvas "save as image" download.
    imgSrc: ['self', 'data:', 'blob:'],
    frameSrc: ['none'],
    objectSrc: ['none'],
    frameAncestors: ['none'],
    formAction: ['self'],
    manifestSrc: ['self'],
    generateNonces: false
  }
}

export { contentSecurityPolicy }
