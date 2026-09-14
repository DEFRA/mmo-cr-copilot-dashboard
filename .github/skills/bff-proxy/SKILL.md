---
name: bff-proxy
description: 'Add or change a server route on the backend-for-frontend — a proxied backend endpoint, the ingest path, the Nunjucks shell, configuration, or the Content-Security-Policy. Use when the browser needs data it cannot currently reach, when the ingest contract changes, or when changing anything under src/server. Do NOT use for charts or views — use the analytics-dashboard skill.'
---

# Skill: Extend the Backend-for-Frontend

Follow `.github/instructions/cdp-frontend.instructions.md`, `security.instructions.md`, and
`testing.instructions.md`.

## 0. Non-negotiables

- The browser talks to **this origin only**. If a change would have the browser call the backend
  directly, stop and add a proxy route instead.
- The proxy is an allow-list. Every upstream path is built by this code from validated parameters.
  Never a catch-all `/api/{path*}`.
- No secret reaches the bundle. The ingest token and the backend URL stay server-side.
- No inline `<script>` in the shell — it would force `'unsafe-inline'` into `script-src`.

## 1. Confirm the backend endpoint exists

Read the backend's `src/routes` and its README. If the endpoint does not exist, that is a change in
`mmo-cr-copilot-backend` and must land there first — the proxy cannot invent an API.

## 2. Add the route

In `src/server/routes/api/controller.js`, alongside the existing ones:

```js
{
  method: 'GET',
  path: '/api/sonar/pr',
  options: {
    validate: {
      query: repositoryQuery.keys({ prNumber: Joi.number().integer().min(1).required() })
    }
  },
  handler: (request, h) =>
    forward(request, h, {
      path: '/api/sonar/pr',
      query: { repository: request.query.repository, prNumber: request.query.prNumber }
    })
}
```

- Declare a joi schema for every parameter; joi's unknown-key rejection stops a caller smuggling
  extra query parameters upstream.
- Forward only the values you validated — never spread `request.query`.
- Encode any value containing `/` when it goes into a path segment. Prefer a query parameter for such
  values.
- Expose read methods only. Writes go through the authenticated ingest route.

## 3. Changing the ingest path

`POST /api/ingest` authenticates with `x-ingest-token` (constant-time comparison) and forwards the
body to the backend, which owns validation. Do not duplicate the payload schema here — one source of
truth.

If the payload contract changes, the change belongs in the backend; this service only needs a body
size review.

## 4. Adding configuration

A documented convict entry in `src/config/config.js` with an `env` key, `sensitive: true` for a
secret, and a row in the README configuration table. Anything a CDP environment must supply has to be
discoverable from the README.

## 5. Passing a value to the browser

Add it as a `data-` attribute on the React root in `src/server/routes/dashboard/index.njk`, supply it
from `dashboardController`, and read it in `src/client/lib/runtime-config.js`. Never an inline script,
and never a secret.

## 6. Test

In `src/server/**/*.test.js`, using `server.inject()`:

- The happy path, and that the upstream URL is exactly what you expect.
- Validation rejection, with no upstream call made.
- The backend's status code relayed unchanged, including an error status.
- `502` when the backend is unreachable.
- For ingest: missing token, wrong token, correct token, and oversized or wrong-content-type bodies.

Assert on `fetchMock.mock.calls[0][0]` to prove the caller cannot influence the upstream URL.

## Definition of Done

`npm run lint`, `npm run format:check`, and `npm test` pass; the upstream path is provably
caller-independent; new configuration is documented in the README; the CSP is unchanged or its change
is justified in a comment; and no secret has reached the client bundle.
