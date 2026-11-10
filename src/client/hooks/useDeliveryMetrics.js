import { useEffect, useState } from 'react'
import { apiFetch, apiUrl } from '../lib/api'

const IDLE = { metrics: null, issues: [], status: 'idle', error: null }

// Backend refreshes Jira behind the response; ask again 10s, 20s then 40s later.
export const REFRESH_DELAY_MS = 10_000
export const MAX_REFRESHES = 3

async function getJson(path, signal) {
  const res = await apiFetch(apiUrl(path), {
    signal,
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

/**
 * Delivery metrics for the period plus the project's Jira tickets. Pass a null
 * slug to stay idle (for example when Jira is not connected). While the
 * backend reports `jira.pending` the request is repeated quietly, keeping the
 * data on screen, up to MAX_REFRESHES times.
 */
export function useDeliveryMetrics(slug, window) {
  const [state, setState] = useState(IDLE)
  const from = window?.start ? new Date(window.start).toISOString() : null
  const to = window?.end ? new Date(window.end).toISOString() : null

  useEffect(() => {
    if (!slug) {
      setState(IDLE)
      return undefined
    }
    const controller = new AbortController()
    const base = `/api/projects/${encodeURIComponent(slug)}`
    const query = new URLSearchParams()
    if (from) query.set('from', from)
    if (to) query.set('to', to)
    let timer = null
    let refreshes = 0

    const load = (quiet) => {
      if (!quiet) setState((s) => ({ ...s, status: 'loading', error: null }))

      Promise.all([
        getJson(`${base}/delivery-metrics?${query}`, controller.signal),
        getJson(`${base}/jira-issues`, controller.signal)
      ])
        .then(([metrics, list]) => {
          setState({
            metrics,
            issues: Array.isArray(list?.issues) ? list.issues : [],
            status: 'success',
            error: null
          })
          if (metrics?.jira?.pending === true && refreshes < MAX_REFRESHES) {
            timer = setTimeout(
              () => {
                refreshes += 1
                load(true)
              },
              REFRESH_DELAY_MS * 2 ** refreshes
            )
          }
        })
        .catch((err) => {
          if (controller.signal.aborted || err.name === 'AbortError') return
          if (quiet) return
          setState({ ...IDLE, status: 'error', error: err.message })
        })
    }

    load(false)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [slug, from, to])

  return state
}
