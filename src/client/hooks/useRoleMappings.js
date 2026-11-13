import { useCallback, useEffect, useState } from 'react'

import { apiFetch, jsonWrite } from '../lib/api'
import { checkedWrite } from '../lib/api-errors'

const isMapping = (m) =>
  m &&
  typeof m.id === 'string' &&
  typeof m.groupName === 'string' &&
  typeof m.role === 'string'

/** Role mappings from the Dashboard-Admin-only BFF routes; malformed rows are dropped. */
export function useRoleMappings(enabled = true) {
  const [mappings, setMappings] = useState([])
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }
    const controller = new AbortController()

    apiFetch('/api/role-mappings', {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`)
        }
        const body = await res.json()
        if (!Array.isArray(body?.roleMappings)) {
          throw new TypeError('Malformed')
        }
        setMappings(body.roleMappings.filter(isMapping))
        setStatus('success')
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus('error')
        }
      })

    return () => controller.abort()
  }, [enabled, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const create = useCallback(
    async (input) => {
      await checkedWrite(jsonWrite('/api/role-mappings', 'POST', input), {
        fallback: 'The role mapping was not saved'
      })
      refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id) => {
      await checkedWrite(
        jsonWrite(`/api/role-mappings/${encodeURIComponent(id)}`, 'DELETE'),
        {
          fallback: 'The role mapping was not removed',
          notFound: 'That role mapping no longer exists'
        }
      )
      refresh()
    },
    [refresh]
  )

  return { mappings, status, refresh, create, remove }
}
