# AGENTS.md — mmo-cr-copilot-dashboard

The Copilot analytics dashboard: a React single page app served by a Hapi backend-for-frontend. It is
the only publicly reachable part of the system — it receives analytics payloads from GitHub Actions,
forwards them to `mmo-cr-copilot-backend`, and proxies the read APIs back to the browser.

This is **not** a GOV.UK Design System service. There is no `govuk-frontend` and no GDS SCSS.

## Setup

```bash
nvm use
npm install
docker compose up -d redis
npm run dev                    # Hapi + Vite middleware on :3000
```

The backend must be running on `:3001`, or set `COPILOT_BACKEND_API_URL`.

## Commands

| Command                  | Purpose                                                  |
| :----------------------- | :------------------------------------------------------- |
| `npm run dev`            | Hapi with Vite in middleware mode                        |
| `npm run build:frontend` | Production bundle into `.public` — runs in CI and Docker |
| `npm test`               | vitest, both projects, with coverage — must pass         |
| `npm run lint`           | eslint (neostandard, JSX enabled) — must pass            |
| `npm run format:check`   | prettier — must pass                                     |
| `npm run format`         | Fix formatting                                           |
| `npm run security-audit` | `npm audit --audit-level=critical` — runs in CI          |

CI runs `npm ci && npm run build:frontend && npm run format:check && npm run lint && npm test`, then
builds the root `Dockerfile` with `DEFRA/cdp-build-action`. Do not rename these scripts.

## Layout

| Path                  | Contains                                                          |
| :-------------------- | :---------------------------------------------------------------- |
| `src/client/`         | React app — components, charts, views, hooks, selectors, tokens   |
| `src/server/routes/`  | `health`, `ingest`, `api` (proxy), `dashboard` (shell), `error`   |
| `src/server/plugins/` | router, CSP, sessions, static files, logging, tracing             |
| `src/config/`         | convict schema and the Nunjucks environment                       |
| `test-helpers/`       | Payload fixtures and chart-option helpers, excluded from coverage |
| `.public/`            | Vite build output, served under `/public`                         |

Import with `#/` (→ `src/`) and `#/test-helpers/` (→ `test-helpers/`).

## Conventions

- Node >= 24, ES modules only. No semicolons, single quotes, no trailing commas.
- **Client:** function components and hooks only; every subscribing effect returns cleanup; metric
  maths lives in `src/client/lib/selectors.js`, never in a component; all colour comes from Tailwind
  `@theme` tokens via `lib/palette.js`.
- **Server:** all configuration through convict; structured logging via `request.logger`; joi
  validation on every route that accepts input.
- **The proxy is an allow-list.** Each route builds its own upstream path from validated parameters.
  No catch-all proxy, and no direct browser-to-backend calls.
- **No inline script.** Runtime config reaches the browser as `data-` attributes so `script-src`
  stays `'self'`. `style-src` allows inline styles only because ECharts requires it.
- Tests sit beside the code: `*.test.js` for the server project, `*.test.{js,jsx}` for the client.

## Detailed guidance

`.github/copilot-instructions.md` is the entry point. It carries the DEFRA **standards precedence**,
the **mandatory DEFRA constraints**, and the **working framework** (§3) that every agent follows —
triage into Trivial / Standard / Complex, then Read → Research → Clarify → Plan → Approval →
Implement → Test → Iterate → Summarise. Code review is optional and on-request only.

It links the instruction files (`.github/instructions/`), the skills (`.github/skills/`), and the
agents (`.github/agents/`): **Dashboard Orchestrator** (coordinates, owns the approval gate),
**Dashboard Planner** (plans + the single research pass), **Dashboard Developer** (implements and
tests), and **Dashboard Code Reviewer** (optional read-only review).

## Related repositories

- [mmo-cr-copilot-backend](https://github.com/DEFRA/mmo-cr-copilot-backend) — owns the payload
  contract, persistence, and the SonarCloud integration. A new field or endpoint must land there
  first.
