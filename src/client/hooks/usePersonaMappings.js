/**
 * usePersonaMappings — fetches and mutates one project's GitHub handle →
 * persona role mapping via the backend proxy. Backs the Settings page, and
 * feeds `buildContributorPersonaMap` for persona attribution elsewhere.
 *
 * Returns:
 *   mappings — array of { githubHandle, persona, updatedAt, scope }, where
 *              scope 'default' marks a read-only mapping from before
 *              mappings were scoped to a project
 *   status   — 'idle' | 'loading' | 'success' | 'error'
 *   error    — Error message string, or null
 *   upsert(githubHandle, persona) — creates or replaces a mapping
 *   remove(githubHandle)          — deletes a mapping
 *   refresh()                     — re-fetches the list
 */
import { useCallback, useEffect, useState } from 'react'
import { apiFetch, apiUrl, jsonWrite } from '../lib/api'

const endpointFor = (slug) =>
  `/api/projects/${encodeURIComponent(slug)}/persona-mappings`

async function parseJson(response) {
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

function byHandle(a, b) {
  return a.githubHandle.localeCompare(b.githubHandle)
}

export function usePersonaMappings(projectSlug) {
  const [state, setState] = useState({
    mappings: [],
    status: 'idle',
    error: null
  })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!projectSlug) {
      setState({ mappings: [], status: 'idle', error: null })
      return undefined
    }
    const controller = new AbortController()
    setState({ mappings: [], status: 'loading', error: null })

    apiFetch(apiUrl(endpointFor(projectSlug)), {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        return parseJson(res)
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({
          mappings: Array.isArray(data?.mappings) ? data.mappings : [],
          status: 'success',
          error: null
        })
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setState((s) => ({
          ...s,
          status: 'error',
          error: err.message || 'Failed to load'
        }))
      })

    return () => controller.abort()
  }, [projectSlug, reloadToken])

  const refresh = useCallback(() => setReloadToken((t) => t + 1), [])

  const upsert = useCallback(
    async (githubHandle, persona) => {
      const res = await jsonWrite(
        `${endpointFor(projectSlug)}/${encodeURIComponent(githubHandle)}`,
        'PUT',
        { persona }
      )

      const body = await parseJson(res)
      if (!res.ok) {
        throw new Error(body?.message || `Request failed (${res.status})`)
      }

      setState((s) => ({
        ...s,
        mappings: [
          ...s.mappings.filter(
            (m) => m.githubHandle.toLowerCase() !== githubHandle.toLowerCase()
          ),
          body
        ].sort(byHandle)
      }))

      return body
    },
    [projectSlug]
  )

  const remove = useCallback(
    async (githubHandle) => {
      const res = await jsonWrite(
        `${endpointFor(projectSlug)}/${encodeURIComponent(githubHandle)}`,
        'DELETE'
      )

      if (!res.ok && res.status !== 404) {
        throw new Error(`Request failed (${res.status})`)
      }

      setState((s) => ({
        ...s,
        mappings: s.mappings.filter(
          (m) => m.githubHandle.toLowerCase() !== githubHandle.toLowerCase()
        )
      }))
    },
    [projectSlug]
  )

  return { ...state, upsert, remove, refresh }
}
