import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Builds the React dashboard into `.public`, which the Hapi server serves under
 * `/public`. The build manifest lets the Nunjucks shell resolve the
 * content-hashed entry and stylesheet file names at render time.
 */
export default defineConfig({
  base: '/public',
  plugins: [react(), tailwindcss()],
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
