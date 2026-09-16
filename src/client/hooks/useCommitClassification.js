/**
 * useCommitClassification — corrects one commit's classification via
 * `PATCH /api/payloads/{repository}/{prNumber}/commits/{commit}`.
 *
 * The backend rejects the change for a pull request that is not yet merged,
 * recomputes the PR's totals, and records the change in the audit trail. The
 * updated payload it returns is handed to `onUpdated` so the dashboard
 * reflects the correction immediately rather than waiting for the next poll.
 */
import { useCallback } from 'react'
import { apiUrl } from '../lib/api'

export function useCommitClassification(onUpdated) {
  return useCallback(
    async ({ repository, prNumber, commit, classification }) => {
      const res = await fetch(
        apiUrl(
          `/api/payloads/${encodeURIComponent(repository)}/${prNumber}/commits/${encodeURIComponent(commit)}`
        ),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ classification })
        }
      )

      const text = await res.text()
      const body = text ? JSON.parse(text) : null

      if (!res.ok) {
        throw new Error(body?.message || `Request failed (${res.status})`)
      }

      if (body?.payload) {
        onUpdated?.(body.payload)
      }

      return body
    },
    [onUpdated]
  )
}
