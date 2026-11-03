import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

const toWindow = (s) => ({
  index: s.index,
  label: s.label,
  start: new Date(s.start),
  end: new Date(s.end)
})

const isValidWindow = (w) =>
  !Number.isNaN(w.start.getTime()) &&
  !Number.isNaN(w.end.getTime()) &&
  w.end > w.start

/**
 * The project's sprint calendar from the server, newest first. An empty list
 * means "use the local fixed cadence", including while loading and on error.
 */
export function useProjectSprints(slug, count = 4) {
  const [state, setState] = useState({ sprints: [], status: 'idle' })

  useEffect(() => {
    if (!slug) return undefined
    const controller = new AbortController()
    setState({ sprints: [], status: 'loading' })

    apiFetch(
      `/api/projects/${encodeURIComponent(slug)}/sprints?count=${count}`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        return res.json()
      })
      .then((data) => {
        const sprints = (Array.isArray(data?.sprints) ? data.sprints : [])
          .map(toWindow)
          .filter(isValidWindow)
        setState({ sprints, status: 'success' })
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setState({ sprints: [], status: 'error' })
      })

    return () => controller.abort()
  }, [slug, count])

  return state
}
