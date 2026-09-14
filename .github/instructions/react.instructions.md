---
description: 'React 19 rules for the dashboard single page app: function components, hooks, effect cleanup, derived state, memoisation, code splitting, error boundaries, and data-feed handling. Use when writing or changing any file under src/client.'
applyTo: 'src/client/**/*.{js,jsx}'
---

# React Rules — React 19

## Components

- Function components and hooks only. No classes, except the existing `ErrorBoundary`, which has to be
  one.
- One component per concern. A component that both fetches and renders a complex visual should be
  split into a hook and a presentational component.
- Props in, callbacks out. A view never reaches into global state; it receives `payloads` and
  `onOpen*` handlers from `App`.
- Name the file after the component and export it by name (`export function Panel`). Only `App` is a
  default export.

## Effects

Every effect that subscribes to anything returns cleanup. Timers, event listeners, observers, and
in-flight requests all leak without it.

```js
useEffect(() => {
  const controller = new AbortController()
  ...
  return () => {
    clearTimeout(timerRef.current)
    controller.abort()
  }
}, [poll])
```

- An effect is for synchronising with something outside React. Logic that belongs in an event handler
  stays in the event handler.
- Guard against setting state after unmount with a `mountedRef`, which the feed hook already does.

## State

- **Derive, do not duplicate.** Anything computable from props or existing state is computed, not
  stored. `visiblePayloads` is derived from `payloads` and the active window, never mirrored into
  state.
- Keep state at the lowest node that needs it. Navigation and the time window belong in `App` because
  several subtrees depend on them; a popover's open flag belongs in the popover.
- Use a `ref` for values that must survive a render but must not trigger one — buffers, timers,
  abort controllers, backoff counters.

## Memoisation

- `useMemo` for a chart `option` object and for selector output over a large payload set. Both are
  expensive and both feed reference-equality comparisons downstream.
- `useCallback` for a handler passed into a memoised child or listed in an effect's dependencies.
- Key the memo on the data **and** the theme — a chart must rebuild when tokens change.
- Do not memoise trivial values; the bookkeeping costs more than the work.

## Code splitting

Route-level views are lazy:

```js
const RepoView = lazy(() =>
  import('./components/views/RepoView').then((m) => ({ default: m.RepoView }))
)
```

Wrap them in `Suspense` with a skeleton, and in an `ErrorBoundary` so one failing view cannot blank
the dashboard.

## Data from the feed

- Everything arriving over the network is untrusted. Validate shape and types before rendering; drop
  malformed entries rather than plotting `NaN`.
- Keep the newest record per `repository:prNumber` — records can arrive out of order.
- Surface every connection state: connecting, live, reconnecting, error. Never blank the screen
  because a request failed; keep the last known data and say it is stale.

## Rendering rules

- Stable `key` values from real identity (`commit`, `repository:prNumber`), never an array index for
  a list that can reorder.
- No `dangerouslySetInnerHTML`.
- Guard every optional field. Payloads are partial in practice and the dashboard must not break on
  incomplete data.
