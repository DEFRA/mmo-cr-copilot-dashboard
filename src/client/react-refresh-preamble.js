/* global window */
/**
 * React Fast Refresh preamble for development.
 *
 * @vitejs/plugin-react normally injects this as an inline <script> when Vite
 * serves the HTML. This app's HTML is rendered by Nunjucks instead, so the
 * preamble lives in a real module: that keeps `script-src` free of
 * 'unsafe-inline' in development as well as production.
 *
 * It must execute before the application entry; both are `type="module"`, so
 * document order is preserved.
 *
 * The specifier is the bare virtual id, not the served URL: Vite resolves
 * imports before applying `base`, then rewrites the result to `/public/...`.
 */
import RefreshRuntime from '/@react-refresh'

RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
