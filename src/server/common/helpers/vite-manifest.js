import path from 'node:path'
import { readFileSync } from 'node:fs'

import { config } from '#/config/config.js'
import { createLogger } from '#/server/common/helpers/logging/logger.js'

/**
 * Resolves the script and stylesheet URLs for the React entry point.
 *
 * In production Vite writes content-hashed file names, so the build manifest is
 * read once and cached. In development the Hapi router mounts Vite in
 * middleware mode under the asset path, and the modules are requested by their
 * source path instead — including the React Fast Refresh preamble, which is a
 * real module rather than an inline script so that the Content-Security-Policy
 * can keep forbidding inline script in every environment.
 */

export const CLIENT_ENTRY = 'src/client/main.jsx'
const REFRESH_PREAMBLE = 'src/client/react-refresh-preamble.js'

const logger = createLogger()

let cachedManifest

function readManifest() {
  if (cachedManifest) {
    return cachedManifest
  }

  const manifestPath = path.join(
    config.get('root'),
    '.public/.vite/manifest.json'
  )

  try {
    cachedManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    logger.error(`Vite manifest not found at ${manifestPath}`)
    cachedManifest = {}
  }

  return cachedManifest
}

export function entryAssets({
  assetPath = config.get('assetPath'),
  isProduction = config.get('isProduction')
} = {}) {
  if (!isProduction) {
    return {
      scripts: [
        `${assetPath}/@vite/client`,
        `${assetPath}/${REFRESH_PREAMBLE}`,
        `${assetPath}/${CLIENT_ENTRY}`
      ],
      // Vite injects styles through the module graph in development.
      stylesheets: []
    }
  }

  const entry = readManifest()[CLIENT_ENTRY]

  return {
    scripts: entry?.file ? [`${assetPath}/${entry.file}`] : [],
    stylesheets: (entry?.css ?? []).map((file) => `${assetPath}/${file}`)
  }
}

/** Test seam — the manifest is otherwise read once per process. */
export function resetManifestCache() {
  cachedManifest = undefined
}
