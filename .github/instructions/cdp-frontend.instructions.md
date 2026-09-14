---
description: 'CDP conventions for the Hapi backend-for-frontend: convict configuration, the backend proxy, the Nunjucks shell, the Vite asset pipeline, Content-Security-Policy, logging, and sessions. Use when changing anything under src/server or src/config.'
applyTo: 'src/{server,config}/**/*.{js,njk}'
---

# CDP Backend-for-Frontend Rules

## Configuration — convict only

Every configurable value lives in `src/config/config.js` with a `doc`, a `format`, a default, and an
`env` key. Secrets are marked `sensitive: true`. Never read `process.env` anywhere else.

`config.validate({ allowed: 'strict' })` runs at import, so a malformed value fails at startup rather
than at the first request.

Read config inside the function that needs it so tests can stub it. Module-scope reads cannot be
stubbed.

## The proxy is an allow-list, not a pass-through

Each proxy route builds its own upstream path from validated parameters:

```js
// WRONG — the browser chooses the upstream path
handler: (request, h) => backendRequest({ path: `/api/${request.params.rest}` })

// CORRECT — this code owns the path; only validated values are interpolated
handler: (request, h) =>
  forward(request, h, {
    path: `/api/payloads/${encodeURIComponent(repository)}/${prNumber}`
  })
```

- Declare a joi schema for every parameter. joi rejects unknown keys, which stops a caller smuggling
  extra query parameters upstream.
- Only proxy the methods the dashboard actually needs. The backend's write endpoint is **not**
  exposed through the read proxy — ingest is its own authenticated route.
- The backend is an internal service: call it directly, never through the outbound proxy.
- Relay the backend's status code unchanged so the client sees the truth.
- An unreachable backend is `502`, never `500`.

## Ingest

`POST /api/ingest` is the only write path. It authenticates with a shared secret in `x-ingest-token`,
compared in constant time, then forwards the body to the backend. Validation lives in the backend so
there is one source of truth for the contract — do not duplicate the schema here.

Cap the body size with `payload.maxBytes` and restrict `payload.allow` to `application/json`.

## The Nunjucks shell

`src/server/common/templates/layouts/page.njk` plus `src/server/routes/dashboard/index.njk` render
the element the React app mounts into. They are a shell, not a page framework — do not grow markup
here that belongs in React.

Runtime configuration reaches the browser as `data-` attributes:

```njk
<div id="root" data-poll-interval-ms="{{ pollIntervalMs }}"></div>
```

**Never** add an inline `<script>`. It would force `'unsafe-inline'` into `script-src` and undo the
Content-Security-Policy.

## Vite assets

`src/server/common/helpers/vite-manifest.js` resolves the entry script and stylesheet:

- **Production** — read `.public/.vite/manifest.json` once and cache it. A missing manifest degrades
  to empty asset lists with a logged error; it must not crash the server.
- **Development** — the router mounts Vite in middleware mode under `/public` and the modules are
  requested by source path, including `react-refresh-preamble.js`. That preamble is a real module
  precisely so the CSP does not need to allow inline script in development either.

## Content-Security-Policy

`src/server/plugins/content-security-policy.js` is deliberately tight:

- `script-src 'self'` — no `unsafe-inline`, no `unsafe-eval`. Do not relax this.
- `style-src 'self' 'unsafe-inline'` — required only because ECharts writes inline styles onto its
  own chart and tooltip elements.
- `connect-src 'self'` in production; development also allows the Vite HMR websocket.
- `img-src` includes `blob:` for ECharts' "save as image".

If a change needs a new directive value, justify it in a comment naming the library that requires it.

## Logging

Use `request.logger` / `server.logger`. Log errors as `logger.error({ err }, 'message')`. Never
`console.*`, and never log a token or a payload body.

## Health check

`GET /health` must stay cheap, unauthenticated, and free of downstream calls — the platform uses it
for container health. Never proxy it to the backend.

## Sessions

`@hapi/yar` with Catbox Redis is wired for future Defra ID authentication. Keep it registered; store
nothing sensitive in a session until authentication exists.
