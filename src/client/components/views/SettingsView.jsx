import { useState } from 'react'
import { Panel } from '../Panel'
import { PERSONAS, personaMeta } from '../../lib/personas'

// Mirrors GitHub's own username rules: alphanumeric, single hyphens, no
// leading/trailing hyphen.
const GITHUB_HANDLE_PATTERN = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/

/**
 * Settings — configure which delivery persona (Developer/DevOps/QA) each
 * GitHub handle is attributed to. The mapping is stored in the backend
 * (MongoDB) via `usePersonaMappings`, rather than hardcoded, so the roster
 * can change without a code deploy.
 */
export function SettingsView({ mappings, status, error, onSave, onRemove }) {
  const [handle, setHandle] = useState('')
  const [persona, setPersona] = useState(PERSONAS[0].id)
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)
  const [removingHandle, setRemovingHandle] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    const trimmed = handle.trim()

    if (!GITHUB_HANDLE_PATTERN.test(trimmed)) {
      setFormError('Enter a valid GitHub handle.')
      return
    }

    setFormError(null)
    setPending(true)
    try {
      await onSave(trimmed, persona)
      setHandle('')
    } catch (err) {
      setFormError(err.message || 'Failed to save the mapping.')
    } finally {
      setPending(false)
    }
  }

  const remove = async (githubHandle) => {
    setRemovingHandle(githubHandle)
    try {
      await onRemove(githubHandle)
    } finally {
      setRemovingHandle(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Panel
        title="Persona / role mapping"
        subtitle="Attribute each GitHub handle to a delivery persona. Handles without a mapping default to Developers."
      >
        <form onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
            GitHub handle
            <input
              type="text"
              className="filter-input"
              placeholder="e.g. octocat"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
            Role
            <select
              className="filter-input"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            >
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="focus-ring rounded-[0.6rem] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save mapping'}
          </button>
        </form>

        {formError && (
          <p
            role="alert"
            className="mb-3 text-xs font-medium text-[var(--color-danger)]"
          >
            {formError}
          </p>
        )}
        {status === 'error' && error && (
          <p
            role="alert"
            className="mb-3 text-xs font-medium text-[var(--color-danger)]"
          >
            Couldn't load mappings: {error}
          </p>
        )}

        {status === 'loading' && mappings.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
        ) : mappings.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No custom mappings yet — every contributor defaults to Developers.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-[var(--color-text-muted)]">
                <th className="pb-2 font-medium">GitHub handle</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => {
                const meta = personaMeta(m.persona)
                return (
                  <tr
                    key={m.githubHandle}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="py-2 text-[var(--color-text)]">
                      {m.githubHandle}
                    </td>
                    <td className="py-2">
                      <span
                        className="pill"
                        style={{ color: meta.accent, borderColor: meta.accent }}
                      >
                        <span aria-hidden="true">{meta.icon}</span>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(m.githubHandle)}
                        disabled={removingHandle === m.githubHandle}
                        className="focus-ring rounded-[0.6rem] border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-50"
                      >
                        {removingHandle === m.githubHandle
                          ? 'Removing…'
                          : 'Remove'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
