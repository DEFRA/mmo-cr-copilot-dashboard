import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Two projects: the Hapi server runs under Node, the React app under jsdom.
 * Coverage is configured once at the root so a single `npm test` run reports
 * across both.
 */
export default defineConfig({
  test: {
    globals: true,
    clearMocks: true,
    projects: [
      {
        test: {
          name: 'server',
          globals: true,
          clearMocks: true,
          environment: 'node',
          include: ['src/{server,config}/**/*.test.js'],
          setupFiles: ['.vite/setup-files.js']
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'client',
          globals: true,
          clearMocks: true,
          environment: 'jsdom',
          include: ['src/client/**/*.test.{js,jsx}'],
          setupFiles: ['.vite/setup-client.js']
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        ...configDefaults.exclude,
        '.public',
        'coverage',
        'src/client/main.jsx',
        'vite.config.js',
        'vitest.config.js',
        '.sonarlint'
      ]
    }
  }
})
