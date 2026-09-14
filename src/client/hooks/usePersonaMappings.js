/**
 * usePersonaMappings — fetches and mutates the GitHub handle → persona role
 * mapping via the backend proxy (`/api/persona-mappings`). Backs the Settings
 * page, and feeds `buildContributorPersonaMap` for persona attribution
 * elsewhere in the dashboard.
 *
 * Returns:
 *   mappings — array of { githubHandle, persona, updatedAt }
 *   status   — 'idle' | 'loading' | 'success' | 'error'
 *   error    — Error message string, or null
 *   upsert(githubHandle, persona) — creates or replaces a mapping
 *   remove(githubHandle)          — deletes a mapping
 *   refresh()                     — re-fetches the list
 */
import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../lib/api'

const ENDPOINT = '/api/persona-mappings'

async function parseJson(response) {
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

function byHandle(a, b) {
  return a.githubHandle.localeCompare(b.githubHandle)
}

export function usePersonaMappings() {
  const [state, setState] = useState({
    mappings: [],
    status: 'idle',
    error: null
  })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((s) => ({ ...s, status: 'loading', error: null }))

    fetch(apiUrl(ENDPOINT), {
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
  }, [reloadToken])

  const refresh = useCallback(() => setReloadToken((t) => t + 1), [])

  const upsert = useCallback(async (githubHandle, persona) => {
    const res = await fetch(
      apiUrl(`${ENDPOINT}/${encodeURIComponent(githubHandle)}`),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ persona })
      }
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
  }, [])

  const remove = useCallback(async (githubHandle) => {
    const res = await fetch(
      apiUrl(`${ENDPOINT}/${encodeURIComponent(githubHandle)}`),
      { method: 'DELETE' }
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
  }, [])

  return { ...state, upsert, remove, refresh }
}
