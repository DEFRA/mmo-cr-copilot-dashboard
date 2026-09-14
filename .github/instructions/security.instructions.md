---
description: 'OWASP Top 10 rules across the Hapi backend-for-frontend and the React app: untrusted input, XSS, CSP, secrets, SSRF through the proxy, authentication, client storage, and dependencies. Use when handling external data, secrets, authentication, or any outbound request.'
applyTo: 'src/**/*.{js,jsx}'
---

# Security Rules — OWASP Top 10

## Secrets never reach the browser

Anything shipped to the browser is public. The ingest token, the SonarCloud token, and the backend URL
all stay on the server.

- No API key, token, or connection string in `src/client`, in an environment variable read at build
  time, or in the Nunjucks shell.
- The browser calls this service; this service calls the backend. That is the only path.

## Untrusted input — server

- Every route that accepts input declares a joi schema. joi rejects unknown keys; do not relax that.
- Compare secrets in constant time with `isTokenValid`, never `===`.
- Cap request bodies with `payload.maxBytes` and restrict `payload.allow`.

## Untrusted input — client

Everything from the network is untrusted until validated.

```js
// WRONG — plots NaN, or worse
setPayloads(body.payloads)

// CORRECT — validated shape, malformed entries dropped
const collected = collectPayloads(await response.json())
if (collected === null) throw new Error('Malformed response')
```

Validate shape and type before rendering. Clamp or allow-list any value used for indexing, a CSS class
name, or a dimension.

## SSRF

This service makes outbound requests on behalf of a caller, so the caller must never influence the
destination.

- Build every upstream URL from `config.get('backend.apiUrl')` plus a path this code owns.
- Interpolate only validated, encoded parameters.
- Never accept a URL, host, or arbitrary path segment from a request.
- Never add a catch-all `/api/{path*}` proxy.

## XSS

- Never `dangerouslySetInnerHTML`. React escapes by default; keep it that way.
- No `eval`, `new Function`, or `setTimeout('string')`.
- Nunjucks autoescaping is on — do not disable it or use `| safe` on anything derived from input.
- Allow-list protocols before putting a value in `href` or `src`.

## Content-Security-Policy

The policy is strict by design. Keep the app compatible with it rather than loosening it:

- No inline `<script>`; runtime configuration travels as `data-` attributes.
- No inline event handlers in markup; use React handlers.
- No `eval`, which is also why `script-src` needs no `unsafe-eval`.
- `style-src` allows inline styles solely because ECharts writes them onto its own elements. Do not
  extend that justification to application code.

## Client storage

- Only non-sensitive UI preferences (theme) go in `localStorage`.
- Never a token, never personal data. An XSS bug can read all of it.

## Error handling

- Server: log with context, return a generic Boom error. Never relay an upstream body or stack.
- Client: error boundaries prevent one failing view from blanking the dashboard, and must never render
  internal detail.
- Distinguish retryable from non-retryable so the client backs off correctly.

## Dependencies

- `npm run security-audit` (`--audit-level=critical`) runs in CI and must pass.
- `.npmrc` pins exact versions and enforces `min-release-age` — do not loosen either.
- A new client dependency ships to every user. Justify the bundle cost before adding one.
