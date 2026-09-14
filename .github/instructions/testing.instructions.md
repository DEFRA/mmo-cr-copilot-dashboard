---
description: 'Vitest conventions for both halves of the repository: the server (Node) and client (jsdom) projects, file placement, the ECharts stub, design tokens in tests, fetch mocking, and what a test should assert. Use when writing or changing any test.'
applyTo: 'src/**/*.test.{js,jsx}'
---

# Testing Rules

## Two projects

`vitest.config.js` defines two projects. A test file is picked up by the one matching its path:

| Project  | Include                            | Environment | Setup                   |
| :------- | :--------------------------------- | :---------- | :---------------------- |
| `server` | `src/{server,config}/**/*.test.js` | node        | `.vite/setup-files.js`  |
| `client` | `src/client/**/*.test.{js,jsx}`    | jsdom       | `.vite/setup-client.js` |

A client test placed under `src/server` will not run. Coverage is configured once at the root so a
single `npm test` reports across both.

## Placement and naming

- A test lives beside the code it covers: `src/client/lib/selectors.js` → `selectors.test.js`.
- Top-level `describe` names the unit with a `#` prefix: `describe('#useLiveFeed', ...)`.
- Test names read as a sentence about behaviour: `test('Should keep the newest payload per pull
request', ...)`.

## Assert behaviour, not implementation

```js
// WRONG — asserts internals
expect(component.state.open).toBe(true)

// CORRECT — asserts what a user observes
expect(
  screen.getByRole('dialog', { name: 'Select time window' })
).toBeInTheDocument()
```

Query by role and accessible name wherever possible. A test that fails because a control lost its
accessible name is a feature.

## Server tests

`server.inject()` exercises the real routing, validation, and error handling — prefer it to unit
testing a handler in isolation.

convict reads the environment once at import, so to test a different configuration either set
`process.env.X` in `beforeAll` before a dynamic `import()`, or `vi.spyOn(config, 'get')` with an
implementation delegating to a reference captured at **module scope**. Capturing inside `beforeEach`
re-wraps the previous spy and recurses.

## Client tests

`.vite/setup-client.js` provides:

- **An ECharts stub.** jsdom cannot draw to a canvas, so the renderer is replaced with a stub that
  records each chart's `option`. Assert on the option through `test-helpers/charts.js` — series types,
  axis data, item colours — not on pixels.
- **Seeded design tokens.** The palette reads CSS custom properties, which jsdom will not resolve from
  the stylesheet. Tokens are seeded on the document element so colour assertions are meaningful.
- **`ResizeObserver` and `matchMedia`**, which jsdom does not implement.
- `cleanup` after each test and a fresh chart-option buffer before each.

## Fetch

`vitest-fetch-mock` is installed globally in both projects. Route responses by URL when a component
tree makes several different calls:

```js
fetchMock.mockResponse((request) =>
  request.url.includes('/api/sonar')
    ? JSON.stringify({ configured: false })
    : JSON.stringify({ payloads })
)
```

`request.url` inside the callback is **absolute** — match with `includes`, not `startsWith`.

Components that render SonarCloud panels will crash on an unexpected response shape, so always mock
`/api/sonar` explicitly when rendering a view or the whole app.

## Time-sensitive tests

The dashboard filters payloads to the current sprint window. Build fixtures from `currentSprint()`
rather than hardcoding dates, or the test will start failing when the window moves on.

## Fixtures

`test-helpers/payload-fixture.js` builds valid payloads: `buildPayload` for one override-driven
payload, `buildCommit` for a commit entry, and `buildPayloadFromCommits` to derive a self-consistent
summary and contributor breakdown from a set of commits. Use them rather than restating the shape.

## Coverage

`npm test` runs with coverage and both workflows depend on it. Cover the failure paths — a malformed
response, an unreachable backend, an unconfigured integration, an empty time window — not just the
happy path.
