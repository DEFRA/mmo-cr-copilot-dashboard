import { useId, useRef, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  ErrorMessage,
  ErrorSummary,
  Hint,
  NotificationBanner,
  Table
} from '../govuk'
import { cx } from '../govuk/utils.js'
import { jsonWrite } from '../../lib/api'
import { ROLES } from '../../lib/roles'

const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/

async function failure(res, fallback) {
  const body = await res.json().catch(() => null)
  return new Error(body?.message || fallback)
}

/**
 * Which repositories feed the active project. Project admins add repositories
 * nobody owns yet and remove their own; moving one between projects needs a
 * dashboard admin, so only they see the other projects' repositories.
 */
export function RepositoryMappingPanel({
  project,
  role,
  repositories,
  unassigned,
  status,
  onChanged
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [repository, setRepository] = useState('')
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(null)
  const [confirming, setConfirming] = useState(null)

  const isDashboardAdmin = role === ROLES.dashboardAdmin
  const mine = repositories.filter((r) => r.projectSlug === project.slug)
  const elsewhere = repositories.filter((r) => r.projectSlug !== project.slug)

  const fail = (message) => {
    setAttempt((n) => n + 1)
    setError(message)
  }

  const map = async (fullName, verb) => {
    setError(null)
    setNotice(null)
    setPending(fullName)
    try {
      const res = await jsonWrite(
        `/api/repositories/${encodeURIComponent(fullName)}`,
        'PUT',
        { projectSlug: project.slug }
      )
      if (!res.ok) throw await failure(res, `${fullName} could not be ${verb}`)
      setNotice({ id: Date.now(), text: `${fullName} ${verb}` })
      setRepository('')
      onChanged()
    } catch (err) {
      fail(err.message)
    } finally {
      setPending(null)
    }
  }

  const unmap = async (fullName) => {
    setError(null)
    setNotice(null)
    setPending(fullName)
    try {
      const res = await jsonWrite(
        `/api/repositories/${encodeURIComponent(fullName)}`,
        'DELETE'
      )
      if (!res.ok) throw await failure(res, `${fullName} could not be removed`)
      setConfirming(null)
      setNotice({
        id: Date.now(),
        text: `${fullName} removed from the project`
      })
      onChanged()
    } catch (err) {
      setConfirming(null)
      fail(err.message)
    } finally {
      setPending(null)
    }
  }

  const submit = (event) => {
    event.preventDefault()
    const name = repository.trim()
    if (!REPOSITORY_PATTERN.test(name)) {
      fail('Enter the repository as owner/name, like DEFRA/mmo-cr-pdf')
      return
    }
    map(name, 'added to the project')
  }

  const state = () => {
    if (mine.length > 0) return 'populated'
    if (status === 'error') return 'error'
    if (status === 'loading' || status === 'idle') return 'loading'
    return 'empty'
  }

  const linkButton = (label, hidden, onClick, disabled) => (
    <button
      type="button"
      className="app-link-button"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
      <span className="govuk-visually-hidden"> {hidden}</span>
    </button>
  )

  return (
    <Panel
      title="Repositories in this project"
      family="speed"
      icon="repo"
      headingLevel={2}
      busy={state() === 'loading'}
    >
      {notice && (
        <NotificationBanner key={notice.id} type="success" autoFocus>
          {notice.text}
        </NotificationBanner>
      )}
      {error && (
        <ErrorSummary
          key={attempt}
          errors={[{ href: `#${inputId}`, text: error }]}
        />
      )}

      <PanelState
        state={state()}
        title="Repositories"
        icon="repo"
        emptyTag="No repositories"
        emptyMessage="No repository sends data to this project yet. Add one below."
        errorMessage="We could not load the repositories. Try again later."
      >
        <Table
          className="govuk-!-margin-bottom-4"
          caption="Repositories in this project"
          captionHidden
          head={[
            { id: 'repo', label: 'Repository' },
            { id: 'sonar', label: 'Sonar project key' },
            {
              id: 'actions',
              label: <span className="govuk-visually-hidden">Actions</span>
            }
          ]}
          rows={mine.map((r) => ({
            id: r.fullName,
            cells: [
              r.fullName,
              r.sonarProjectKey ? (
                <code key="k">{r.sonarProjectKey}</code>
              ) : (
                '—'
              ),
              confirming === r.fullName ? (
                <span key="confirm">
                  <Button
                    variant="warning"
                    disabled={pending === r.fullName}
                    onClick={() => unmap(r.fullName)}
                  >
                    Confirm remove
                  </Button>{' '}
                  <button
                    type="button"
                    className="app-link-button"
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                linkButton('Remove', `${r.fullName} from this project`, () =>
                  setConfirming(r.fullName)
                )
              )
            ]
          }))}
        />
      </PanelState>

      <form onSubmit={submit} noValidate>
        <div
          className={cx('govuk-form-group', error && 'govuk-form-group--error')}
        >
          <label className="govuk-label govuk-label--s" htmlFor={inputId}>
            Add a repository
          </label>
          <Hint id={`${inputId}-hint`}>
            As owner/name, like DEFRA/mmo-cr-pdf. Map a repository before adding
            the analytics workflow to it, as data from an unmapped repository is
            held back.
          </Hint>
          {error && (
            <ErrorMessage id={`${inputId}-error`}>{error}</ErrorMessage>
          )}
          <input
            ref={inputRef}
            className={cx(
              'govuk-input govuk-input--width-30',
              error && 'govuk-input--error'
            )}
            id={inputId}
            type="text"
            spellCheck={false}
            autoComplete="off"
            aria-describedby={cx(
              `${inputId}-hint`,
              error && `${inputId}-error`
            )}
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending !== null}>
          Add repository
        </Button>
      </form>

      {unassigned.length > 0 && (
        <>
          <h3 className="govuk-heading-s govuk-!-margin-top-6">
            Sending data, but not in a project
          </h3>
          <Table
            caption="Repositories sending data that no project owns"
            captionHidden
            head={[
              { id: 'repo', label: 'Repository' },
              {
                id: 'actions',
                label: <span className="govuk-visually-hidden">Actions</span>
              }
            ]}
            rows={unassigned.map((name) => ({
              id: name,
              cells: [
                name,
                linkButton(
                  'Add',
                  `${name} to this project`,
                  () => map(name, 'added to the project'),
                  pending === name
                )
              ]
            }))}
          />
        </>
      )}

      {isDashboardAdmin && elsewhere.length > 0 && (
        <>
          <h3 className="govuk-heading-s govuk-!-margin-top-6">
            In other projects
          </h3>
          <Table
            caption="Repositories in other projects"
            captionHidden
            head={[
              { id: 'repo', label: 'Repository' },
              { id: 'project', label: 'Project' },
              {
                id: 'actions',
                label: <span className="govuk-visually-hidden">Actions</span>
              }
            ]}
            rows={elsewhere.map((r) => ({
              id: r.fullName,
              cells: [
                r.fullName,
                <code key="p">{r.projectSlug}</code>,
                linkButton(
                  'Move here',
                  `${r.fullName} to ${project.name}`,
                  () => map(r.fullName, 'moved to this project'),
                  pending === r.fullName
                )
              ]
            }))}
          />
        </>
      )}
    </Panel>
  )
}
