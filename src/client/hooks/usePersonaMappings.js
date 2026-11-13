/**
 * usePersonaMappings — fetches and mutates one project's GitHub handle →
 * persona role mapping via the backend proxy. Backs the Settings page, and
 * feeds `buildContributorPersonaMap` for persona attribution elsewhere.
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
import { apiFetch, apiUrl, jsonWrite } from '../lib/api'
import { checkedWrite, readApiError, toApiError } from '../lib/api-errors'
import { HTTP } from '../lib/http-status'

const endpointFor = (slug) =>
  `/api/projects/${encodeURIComponent(slug)}/persona-mappings`

async function parseJson(response) {
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

function byHandle(a, b) {
  return a.githubHandle.localeCompare(b.githubHandle)
}

const sameHandle = (a, b) => a.toLowerCase() === b.toLowerCase()
const handlePath = (slug, githubHandle) =>
  `${endpointFor(slug)}/${encodeURIComponent(githubHandle)}`

async function loadMappings(slug, signal) {
  const res = await apiFetch(apiUrl(endpointFor(slug)), {
    signal,
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`)
  }
  const data = await parseJson(res)
  return Array.isArray(data?.mappings) ? data.mappings : []
}

// Already gone is the outcome the user asked for.
async function deleteMapping(slug, githubHandle) {
  const fallback = 'The mapping could not be removed'
  let res
  try {
    res = await jsonWrite(handlePath(slug, githubHandle), 'DELETE')
  } catch (err) {
    throw toApiError(err, fallback)
  }
  if (!res.ok && res.status !== HTTP.notFound) {
    throw await readApiError(res, { fallback })
  }
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

    loadMappings(projectSlug, controller.signal)
      .then((mappings) => {
        if (!controller.signal.aborted) {
          setState({ mappings, status: 'success', error: null })
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') {
          return
        }
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
      const res = await checkedWrite(
        jsonWrite(handlePath(projectSlug, githubHandle), 'PUT', { persona }),
        { fallback: 'The mapping could not be saved' }
      )
      const body = await parseJson(res)

      setState((s) => ({
        ...s,
        mappings: [
          ...s.mappings.filter(
            (m) => !sameHandle(m.githubHandle, githubHandle)
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
      await deleteMapping(projectSlug, githubHandle)
      setState((s) => ({
        ...s,
        mappings: s.mappings.filter(
          (m) => !sameHandle(m.githubHandle, githubHandle)
        )
      }))
    },
    [projectSlug]
  )

  return { ...state, upsert, remove, refresh }
}
