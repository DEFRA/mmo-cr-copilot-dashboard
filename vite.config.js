import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { NodePackageImporter } from 'sass'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const MOJ_IMAGES = path.join(
  ROOT,
  'node_modules/@ministryofjustice/frontend/moj/assets/images'
)
const IMAGE_NAME = /\/assets\/images\/([\w-]+\.(?:svg|png))/g
// Only referenced by GOV.UK branding selectors this service never renders.
const BRANDING_IMAGES = new Set(['govuk-crest.svg'])

/**
 * GOV.UK and MOJ Sass build image URLs from `$moj-assets-path`, which Vite does
 * not rebase. Serve them in development and emit only the referenced ones.
 */
function designSystemAssets() {
  return {
    name: 'design-system-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [match] = (request.url ?? '').split('?')[0].matchAll(IMAGE_NAME)
        const file = match && path.join(MOJ_IMAGES, match[1])

        if (!file || !existsSync(file)) {
          next()
          return
        }

        response.setHeader(
          'Content-Type',
          file.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
        )
        response.end(readFileSync(file))
      })
    },
    generateBundle(_options, bundle) {
      const names = new Set()

      for (const output of Object.values(bundle)) {
        if (output.type === 'asset' && output.fileName.endsWith('.css')) {
          for (const [, name] of String(output.source).matchAll(IMAGE_NAME)) {
            names.add(name)
          }
        }
      }

      for (const name of names) {
        if (BRANDING_IMAGES.has(name)) {
          continue
        }

        const file = path.join(MOJ_IMAGES, name)
        if (!existsSync(file)) {
          this.error(`Design system image not found: ${name}`)
        }

        this.emitFile({
          type: 'asset',
          fileName: `assets/images/${name}`,
          source: readFileSync(file)
        })
      }
    }
  }
}

/**
 * Builds the React dashboard into `.public`, which the Hapi server serves under
 * `/public`. The build manifest lets the Nunjucks shell resolve the
 * content-hashed entry and stylesheet file names at render time.
 */
export default defineConfig({
  base: '/public',
  plugins: [react(), designSystemAssets()],
  css: {
    // GOV.UK Frontend still ships an old IE `@media` hack; drop it when minifying.
    lightningcss: { errorRecovery: true },
    preprocessorOptions: {
      scss: {
        importers: [new NodePackageImporter(ROOT)],
        // MOJ Frontend loads GOV.UK Frontend by a `node_modules/` path.
        loadPaths: [ROOT],
        quietDeps: true
      }
    }
  },
  build: {
    outDir: '.public',
    manifest: true,
    rolldownOptions: {
      input: {
        application: 'src/client/main.jsx'
      }
    },
    sourcemap: true
  },
  // In development the router mounts Vite in middleware mode under /public.
  server: {}
})
