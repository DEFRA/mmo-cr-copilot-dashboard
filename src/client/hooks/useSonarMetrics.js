/**
 * useSonarMetrics — fetches SonarCloud code-quality metrics from the backend
 * proxy (`/api/sonar/*`). The token stays server-side; this hook only ever
 * sees the compact, already-shaped response.
 *
 * Pass a `path` (e.g. `/api/sonar/repo/<encoded repo>`); the hook refetches
 * whenever it changes and aborts any in-flight request on change/unmount.
 *
 * Returns:
 *   data    — the parsed response (may be `{ configured:false }` or
 *             `{ linked:false }` — callers decide how to render those)
 *   status  — 'idle' | 'loading' | 'success' | 'error'
 *   error   — Error message string, or null
 */
import { useEffect, useState } from 'react'
import { apiUrl } from '../lib/api'

export function useSonarMetrics(path) {
  const [state, setState] = useState({
    data: null,
    status: 'idle',
    error: null
  })

  useEffect(() => {
    if (!path) {
      setState({ data: null, status: 'idle', error: null })
      return undefined
    }

    const controller = new AbortController()
    setState((s) => ({ ...s, status: 'loading', error: null }))

    fetch(apiUrl(path), {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ data, status: 'success', error: null })
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setState({
          data: null,
          status: 'error',
          error: err.message || 'Failed to load'
        })
      })

    return () => controller.abort()
  }, [path])

  return state
}
