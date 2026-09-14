---
name: unit-tests
description: 'Write and strengthen vitest tests for the MMO Copilot analytics dashboard: client tests for selectors, hooks, components and charts under jsdom with Testing Library, and server tests for BFF routes via Hapi server.inject with a mocked backend. Use when adding tests for new/changed behaviour, closing coverage gaps, or setting up a test for a new view or route. Enforces the tiered coverage targets and the DEFRA SonarCloud gate.'
argument-hint: "e.g. 'write tests for selectPersonaSummaries' or 'close the coverage gap in the persona-mappings proxy route'"
user-invocable: false
---

# Unit & route tests (vitest)

Write fast, deterministic tests that ship **with** the code, following the
[testing instructions](../../instructions/testing.instructions.md). New or changed behaviour is not
done until it has tests and the suite is green.

The suite runs as **two vitest projects**: `server` (Node environment) and `client` (jsdom). A test
belongs to the project that matches the code it covers — do not import browser APIs into a server
test, or Node APIs into a client test.

## When to use

- Adding tests for a new/changed selector, hook, component, chart, route or helper.
- Adding a route/integration test for a new BFF proxy endpoint.
- Closing a coverage gap flagged by SonarCloud or the coverage report.

## What to test (by layer)

- **Selectors** (`src/client/lib/selectors.js`) — inputs → outputs, including the empty array,
  malformed entries, zero denominators, and the rebase/merge exclusion rules. These carry the
  business meaning of the dashboard; test them hardest.
- **Hooks** — state transitions, the success/error/loading path, cleanup on unmount, and abort of the
  in-flight request. Use `renderHook` with `waitFor`.
- **Components and views** — what the user perceives: rendered text, roles, accessible names, and the
  loading/empty/error/populated states. Query by role/label/text, never by CSS class or test-id
  where a role exists.
- **Charts** — the `option` object produced for given data (series, axes, palette keys) and the
  presence of the accessible name and data-table alternative. Do not assert on canvas pixels.
- **Server routes (integration)** — via Hapi `server.inject` against `createServer()`; assert the
  status code, the response body, and **the exact upstream URL and method the proxy called**. Mock
  the backend with `fetchMock`; never hit a real network.
- **Failure paths** — payload validation rejections, a bad gateway when the backend is unreachable,
  and every error branch. These are **100%**-coverage paths.

## Procedure

1. **Read** the code under test and the existing colocated `*.test.js(x)` nearby for the established
   pattern.
2. **Arrange** — for server tests build the server in `beforeAll` (`server.initialize()`) and tear
   down in `afterAll` (`server.stop({ timeout: 0 })`). Mock outbound HTTP with `fetchMock`. Build
   payload fixtures with the helpers in `test-helpers/` rather than hand-writing the whole shape.
   Rely on `clearMocks` and a fixed `TZ=UTC`.
3. **Act** — call the function directly, `renderHook` for a hook, `render` for a component, or
   `server.inject({ method, url, payload })` for a route.
4. **Assert** — one behaviour per test; assert outputs/status/rendered result, not implementation
   details.
5. **Name** tests to describe behaviour (`Should reject an unknown persona without calling the
backend`). Keep tests independent and order-agnostic; no real timers or `sleep` — use fake timers.
6. **Run & verify** — `npm test` (with coverage). Confirm all pass and coverage meets the targets
   before finishing.

## Gotchas in this repo

- **`fetchMock` and null-body statuses.** A mocked `204` must use `fetchMock.mockResponse(null, {
status: 204 })` — passing `''` throws `Invalid response status code 204` from the `Response`
  constructor.
- **Lazy views.** Views are `React.lazy`, so a drill-down waits on a dynamic import. Pass an extended
  timeout to `findBy*` queries in navigation tests.
- **Time windows.** Payloads must fall inside the active sprint window to be rendered — build
  fixtures relative to `currentSprint()`, not a hardcoded date.
- **Duplicate text.** A label can appear in both a form control and a table; scope the query with
  `within(screen.getByRole('table'))` rather than loosening the assertion.
- **SonarCloud panels self-hide.** Views render them unconditionally, so mock
  `{ configured: false }` in `beforeEach` for view tests.

## Coverage targets (must hold)

- **≥90%** global · **≥95%** core logic (selectors, hooks, controllers, helpers) · **100%**
  error-handling and security-critical paths (payload validation, the proxy allow-list, ingest auth,
  error mapping).
- Coverage must be **reported** and must not regress below the DEFRA
  [SonarCloud](https://sonarcloud.io/organizations/defra) baseline; the quality gate stays green.

## Anti-patterns to avoid

- Hitting a real network or depending on external state.
- Time/locale flakiness — always pin `TZ` and use fake timers, never `sleep`.
- Asserting internal calls or component internals instead of observable behaviour.
- Querying by CSS class or a test-id where a role or label exists.
- Snapshotting entire views brittlely — assert the specific output that matters.
- Leaving the suite red or skipping a failing test "to fix later".

## Output

- The added/updated `*.test.js(x)` colocated with the source.
- A short note of what is covered, any gaps intentionally left (with rationale), and the
  pass/coverage result from `npm test`.

## References

- [testing instructions](../../instructions/testing.instructions.md) ·
  [copilot-instructions.md](../../copilot-instructions.md)
