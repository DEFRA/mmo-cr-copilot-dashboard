import { useEffect, useMemo, useState } from 'react'
import { apiFetch, apiUrl } from '../lib/api'
import { selectDeliveryTrend } from '../lib/selectors'

const IDLE = { points: [], status: 'idle' }

/** Delivery metrics for each sprint (newest first), as trend points oldest first. */
export function useDeliveryTrend(slug, sprints) {
  const [state, setState] = useState(IDLE)
  const windows = useMemo(
    () =>
      (sprints ?? []).map((s) => ({
        label: s.label,
        index: s.index,
        from: new Date(s.start).toISOString(),
        to: new Date(s.end).toISOString()
      })),
    [sprints]
  )
  const key = windows.map((w) => `${w.from}/${w.to}`).join(',')

  useEffect(() => {
    if (!slug || windows.length === 0) {
      setState(IDLE)
      return undefined
    }
    const controller = new AbortController()
    setState((s) => ({ ...s, status: 'loading' }))
    const base = `/api/projects/${encodeURIComponent(slug)}/delivery-metrics`

    Promise.all(
      windows.map((w) =>
        apiFetch(
          apiUrl(`${base}?${new URLSearchParams({ from: w.from, to: w.to })}`),
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
          }
        ).then((res) => {
          if (!res.ok) {
            throw new Error(`Request failed (${res.status})`)
          }
          return res.json()
        })
      )
    )
      .then((results) =>
        setState({
          points: selectDeliveryTrend(results, windows),
          status: 'success'
        })
      )
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') {
          return
        }
        setState({ ...IDLE, status: 'error' })
      })

    return () => controller.abort()
    // `key` stands in for `windows`: same sprints, same requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, key])

  return state
}
