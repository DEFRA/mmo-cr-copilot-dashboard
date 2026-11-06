import { useCallback, useEffect, useState } from 'react'

import { apiFetch, apiUrl, jsonWrite } from '../lib/api'
import { readApiError } from '../lib/api-errors'
import { toWorkflow, toWorkflowPayload } from '../lib/jira-workflow'

const IDLE = { slug: null, status: 'idle', workflow: null, error: null }
const IDLE_STATUSES = {
  slug: null,
  status: 'idle',
  statuses: [],
  jiraAvailable: true
}
const CATEGORIES = new Set(['new', 'indeterminate', 'done'])
export const LOAD_FAILED =
  'We could not load the Jira workflow. Try again later.'
export const SAVE_FAILED = 'The Jira workflow could not be saved. Try again.'

const basePath = (slug) => `/api/projects/${encodeURIComponent(slug)}/jira`

async function getJson(path, signal, fallback) {
  const res = await apiFetch(apiUrl(path), {
    signal,
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    throw await readApiError(res, { context: 'jiraWorkflow', fallback })
  }
  return res.json()
}

const toStatus = (s) => ({
  name: s.name,
  categoryKey: CATEGORIES.has(s.categoryKey) ? s.categoryKey : null,
  issueCount: Number.isInteger(s.issueCount) ? s.issueCount : 0,
  inJira: s.inJira === true
})

// Another project's data is never shown, not even for the render before the effect runs.
function forSlug(state, slug, idle) {
  if (state.slug === slug) return state
  return slug ? { ...idle, slug, status: 'loading' } : idle
}

const loading = (slug, idle) => (s) =>
  s.slug === slug
    ? { ...s, status: 'loading' }
    : { ...idle, slug, status: 'loading' }

/** The project's Jira workflow and a save that respects its version. Pass a null slug to stay idle. */
export function useJiraWorkflow(slug) {
  const [state, setState] = useState(IDLE)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!slug) {
      setState(IDLE)
      return undefined
    }
    const controller = new AbortController()
    setState(loading(slug, IDLE))

    getJson(`${basePath(slug)}/workflow`, controller.signal, LOAD_FAILED)
      .then((raw) => {
        const workflow = toWorkflow(raw)
        if (!workflow) throw new Error('Malformed workflow')
        setState({ slug, status: 'success', workflow, error: null })
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        const error =
          err.name === 'ApiError'
            ? { status: err.status, message: err.message }
            : { status: 0, message: LOAD_FAILED }
        setState((s) => ({ ...s, status: 'error', error }))
      })

    return () => controller.abort()
  }, [slug, reloadToken])

  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  const save = useCallback(
    async (stages, version) => {
      try {
        const res = await jsonWrite(
          `${basePath(slug)}/workflow`,
          'PUT',
          toWorkflowPayload(stages, version)
        )
        if (!res.ok) {
          const { status, message } = await readApiError(res, {
            context: 'jiraWorkflow',
            fallback: SAVE_FAILED
          })
          return { ok: false, status, message }
        }
        const workflow = toWorkflow(await res.json().catch(() => null))
        if (!workflow) {
          return { ok: false, status: res.status, message: SAVE_FAILED }
        }
        setState((s) =>
          s.slug === slug
            ? { slug, status: 'success', workflow, error: null }
            : s
        )
        return { ok: true, workflow }
      } catch {
        return { ok: false, status: 0, message: SAVE_FAILED }
      }
    },
    [slug]
  )

  const { slug: _slug, ...visible } = forSlug(state, slug, IDLE)
  return { ...visible, save, reload }
}

/** Statuses seen on the project's tickets and in Jira. Pass a null slug to stay idle. */
export function useJiraStatuses(slug) {
  const [state, setState] = useState(IDLE_STATUSES)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!slug) {
      setState(IDLE_STATUSES)
      return undefined
    }
    const controller = new AbortController()
    setState(loading(slug, IDLE_STATUSES))

    getJson(
      `${basePath(slug)}/statuses`,
      controller.signal,
      'We could not load the Jira statuses. Try again later.'
    )
      .then((body) => {
        setState({
          slug,
          status: 'success',
          jiraAvailable: body?.jiraAvailable !== false,
          statuses: (Array.isArray(body?.statuses) ? body.statuses : [])
            .filter((s) => typeof s?.name === 'string' && s.name.trim())
            .map(toStatus)
        })
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setState((s) => ({ ...s, status: 'error' }))
      })

    return () => controller.abort()
  }, [slug, reloadToken])

  const refresh = useCallback(() => setReloadToken((t) => t + 1), [])

  const { slug: _slug, ...visible } = forSlug(state, slug, IDLE_STATUSES)
  return { ...visible, refresh }
}
