import { useCallback, useEffect, useState } from 'react'

import { apiFetch, apiUrl } from '../lib/api'

const getJson = (path, signal) =>
  apiFetch(apiUrl(path), {
    signal,
    headers: { Accept: 'application/json' }
  }).then((res) => {
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return res.json()
  })

/**
 * Repositories the caller can see, and the ones sending data that no project
 * owns yet. Only project admins may list the unassigned ones, so a refused
 * request there is an empty list rather than an error.
 */
export function useRepositories(enabled = true) {
  const [state, setState] = useState({
    repositories: [],
    unassigned: [],
    status: 'idle'
  })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    setState((s) => ({ ...s, status: 'loading' }))

    Promise.all([
      getJson('/api/repositories', controller.signal),
      getJson('/api/repositories/unassigned', controller.signal).catch(
        (err) => {
          if (err.name === 'AbortError') throw err
          return { repositories: [] }
        }
      )
    ])
      .then(([repos, unassigned]) => {
        if (controller.signal.aborted) return
        setState({
          repositories: Array.isArray(repos?.repositories)
            ? repos.repositories
            : [],
          unassigned: Array.isArray(unassigned?.repositories)
            ? unassigned.repositories
            : [],
          status: 'success'
        })
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setState((s) => ({ ...s, status: 'error' }))
      })

    return () => controller.abort()
  }, [enabled, reloadToken])

  const refresh = useCallback(() => setReloadToken((t) => t + 1), [])

  return { ...state, refresh }
}
