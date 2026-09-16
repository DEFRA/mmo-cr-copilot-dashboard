/**
 * useLiveFeed — owns the connection to the analytics feed.
 *
 * Payloads are pushed into the backend by the GitHub Actions workflow, so the
 * dashboard keeps itself current by polling `GET /api/payloads` (proxied by
 * this app's own Hapi server) on an interval:
 *
 *  1. Fetches immediately on mount, then every `pollIntervalMs`.
 *  2. Validates every payload against a shape guard — malformed entries are
 *     dropped rather than rendered.
 *  3. Keeps a Map<`repo:prNumber`> so each PR is represented by its most recent
 *     analysis, newest-wins by `calculatedAt`.
 *  4. Backs off exponentially with jitter (1s → 30s) after a failure and resets
 *     on the next success, so a backend outage does not become a request storm.
 *  5. Aborts the in-flight request and clears every timer on unmount.
 *
 * Exposed:
 *   payloads      — current array of latest-per-PR analytics payloads
 *   status        — 'connecting' | 'open' | 'reconnecting' | 'error'
 *   lastMessageAt — Date of the last successful poll, or null
 *   applyPayload  — replaces one PR's payload locally, so a change made from
 *                   the dashboard shows without waiting for the next poll
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiUrl } from '../lib/api'
import { readRuntimeConfig } from '../lib/runtime-config'

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

function jitter(ms) {
  return ms + Math.random() * ms * 0.3
}

// ── Shape validation ─────────────────────────────────────────────────────────
export function isValidPayload(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof data.prNumber === 'number' &&
    data.prNumber > 0 &&
    typeof data.repository === 'string' &&
    data.repository.length > 0 &&
    data.summary !== null &&
    typeof data.summary === 'object' &&
    typeof data.summary.copilotAssistedRate === 'number' &&
    typeof data.summary.totalCommits === 'number' &&
    Array.isArray(data.commitBreakdown) &&
    Array.isArray(data.contributorBreakdown)
  )
}

/** Reduces a response body to the newest valid payload per repository and PR. */
export function collectPayloads(body) {
  if (!Array.isArray(body?.payloads)) {
    return null
  }

  const latest = new Map()

  for (const payload of body.payloads.filter(isValidPayload)) {
    const key = `${payload.repository}:${payload.prNumber}`
    const existing = latest.get(key)

    if (
      !existing ||
      new Date(payload.calculatedAt) >= new Date(existing.calculatedAt)
    ) {
      latest.set(key, payload)
    }
  }

  return [...latest.values()]
}

export function useLiveFeed({ pollIntervalMs } = readRuntimeConfig()) {
  const [payloads, setPayloads] = useState([])
  const [status, setStatus] = useState('connecting')
  const [lastMessageAt, setLastMessageAt] = useState(null)

  const backoffRef = useRef(MIN_BACKOFF_MS)
  const timerRef = useRef(null)
  const controllerRef = useRef(null)
  const mountedRef = useRef(true)
  /** Whether at least one poll has succeeded — drives error vs reconnecting. */
  const hasDataRef = useRef(false)

  const poll = useCallback(async () => {
    if (!mountedRef.current) {
      return
    }

    const controller = new AbortController()
    controllerRef.current = controller

    let delay = pollIntervalMs

    try {
      const response = await fetch(apiUrl('/api/payloads'), {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      })

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const collected = collectPayloads(await response.json())
      if (collected === null) {
        throw new Error('Malformed response')
      }

      if (!mountedRef.current) {
        return
      }

      backoffRef.current = MIN_BACKOFF_MS
      hasDataRef.current = true
      setPayloads(collected)
      setLastMessageAt(new Date())
      setStatus('open')
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) {
        return
      }

      setStatus(hasDataRef.current ? 'reconnecting' : 'error')
      delay = jitter(backoffRef.current)
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
    }

    if (mountedRef.current) {
      timerRef.current = setTimeout(poll, delay)
    }
  }, [pollIntervalMs])

  useEffect(() => {
    mountedRef.current = true
    poll()

    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
      controllerRef.current?.abort()
    }
  }, [poll])

  const applyPayload = useCallback((payload) => {
    if (!isValidPayload(payload)) {
      return
    }

    setPayloads((current) => [
      ...current.filter(
        (p) =>
          p.repository !== payload.repository || p.prNumber !== payload.prNumber
      ),
      payload
    ])
  }, [])

  return { payloads, status, lastMessageAt, applyPayload }
}
