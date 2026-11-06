import { useEffect, useState } from 'react'
import { apiFetch, apiUrl } from '../lib/api'

const IDLE = { data: null, status: 'idle', error: null }

/**
 * A project-scoped metrics endpoint (`/api/projects/{slug}/{endpoint}`) for a
 * window. Pass a null slug to stay idle.
 */
export function useProjectMetric(slug, endpoint, window, params = {}) {
  const [state, setState] = useState(IDLE)
  const from = window?.start ? new Date(window.start).toISOString() : null
  const to = window?.end ? new Date(window.end).toISOString() : null

  useEffect(() => {
    if (!slug) {
      setState(IDLE)
      return undefined
    }
    const controller = new AbortController()
    const query = new URLSearchParams()
    if (from) query.set('from', from)
    if (to) query.set('to', to)
    for (const [key, val] of Object.entries(params)) {
      if (val !== null && val !== undefined) query.set(key, val)
    }
    setState((s) => ({ ...s, status: 'loading', error: null }))

    apiFetch(
      apiUrl(`/api/projects/${encodeURIComponent(slug)}/${endpoint}?${query}`),
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        return res.json()
      })
      .then((data) => setState({ data, status: 'success', error: null }))
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setState({ ...IDLE, status: 'error', error: err.message })
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params keyed by its JSON
  }, [slug, endpoint, from, to, JSON.stringify(params)])

  return state
}

/** Copilot Leverage v2 for a project; the window bounds the adopted period. */
export const useLeverageV2 = (slug, window, repository) =>
  useProjectMetric(
    slug,
    'leverage-v2',
    window,
    repository ? { repository } : {}
  )
