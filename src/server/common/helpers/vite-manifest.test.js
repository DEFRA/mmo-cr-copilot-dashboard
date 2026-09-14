import { readFileSync } from 'node:fs'

import {
  entryAssets,
  resetManifestCache,
  CLIENT_ENTRY
} from './vite-manifest.js'

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))

const manifest = JSON.stringify({
  [CLIENT_ENTRY]: {
    file: 'assets/application-abc123.js',
    css: ['assets/application-def456.css']
  }
})

describe('#entryAssets', () => {
  beforeEach(() => {
    resetManifestCache()
  })

  describe('In development', () => {
    test('Should request the source modules through the Vite middleware', () => {
      const assets = entryAssets({ assetPath: '/public', isProduction: false })

      expect(assets.scripts).toEqual([
        '/public/@vite/client',
        '/public/src/client/react-refresh-preamble.js',
        `/public/${CLIENT_ENTRY}`
      ])
      expect(assets.stylesheets).toEqual([])
      expect(readFileSync).not.toHaveBeenCalled()
    })
  })

  describe('In production', () => {
    test('Should resolve hashed assets from the build manifest', () => {
      readFileSync.mockReturnValue(manifest)

      const assets = entryAssets({ assetPath: '/public', isProduction: true })

      expect(assets).toEqual({
        scripts: ['/public/assets/application-abc123.js'],
        stylesheets: ['/public/assets/application-def456.css']
      })
    })

    test('Should read the manifest only once', () => {
      readFileSync.mockReturnValue(manifest)

      entryAssets({ isProduction: true })
      entryAssets({ isProduction: true })

      expect(readFileSync).toHaveBeenCalledTimes(1)
    })

    test('Should honour a custom asset path', () => {
      readFileSync.mockReturnValue(manifest)

      const assets = entryAssets({ assetPath: '/static', isProduction: true })

      expect(assets.scripts).toEqual(['/static/assets/application-abc123.js'])
    })

    test('Should degrade to empty asset lists when the manifest is missing', () => {
      readFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      expect(entryAssets({ isProduction: true })).toEqual({
        scripts: [],
        stylesheets: []
      })
    })

    test('Should degrade to empty asset lists when the entry is absent', () => {
      readFileSync.mockReturnValue('{}')

      expect(entryAssets({ isProduction: true })).toEqual({
        scripts: [],
        stylesheets: []
      })
    })
  })
})
