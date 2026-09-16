/**
 * useAuditLogs — reads a page of the audit trail (`/api/audit-logs`), the
 * record of every change an operator has made through the dashboard.
 *
 * The window and paging are owned by the caller so they can be reflected in
 * the UI; this hook only fetches whatever is passed in.
 *
 * Returns:
 *   entries    — array of { id, occurredAt, action, entity, entityId,
 *                summary, before, after, actor }
 *   page       — the page the backend actually served (it clamps overshoot)
 *   totalPages — number of pages available for the current window
 *   total      — total matching entries
 *   status     — 'idle' | 'loading' | 'success' | 'error'
 *   error      — error message string, or null
 *   refresh()  — re-fetches the current page
 */
import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../lib/api'

const ENDPOINT = '/api/audit-logs'

const EMPTY = {
  entries: [],
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1
}

function buildQuery({ from, to, page, pageSize }) {
  const params = new URLSearchParams()
  if (from) params.set('from', new Date(from).toISOString())
  if (to) params.set('to', new Date(to).toISOString())
  if (page) params.set('page', String(page))
  if (pageSize) params.set('pageSize', String(pageSize))
  return params.toString()
}

export function useAuditLogs({ from, to, page = 1, pageSize = 25 } = {}) {
  const [state, setState] = useState({
    ...EMPTY,
    status: 'idle',
    error: null
  })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((s) => ({ ...s, status: 'loading', error: null }))

    const query = buildQuery({ from, to, page, pageSize })

    fetch(apiUrl(`${ENDPOINT}?${query}`), {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({
          entries: Array.isArray(data?.entries) ? data.entries : [],
          page: data?.page ?? 1,
          pageSize: data?.pageSize ?? pageSize,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
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
  }, [from, to, page, pageSize, reloadToken])

  const refresh = useCallback(() => setReloadToken((t) => t + 1), [])

  return { ...state, refresh }
}
