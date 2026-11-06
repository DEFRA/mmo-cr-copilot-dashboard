import { useEffect, useId, useRef, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  Combobox,
  ErrorSummary,
  NotificationBanner,
  Table,
  TextInput
} from '../govuk'
import { cx } from '../govuk/utils.js'
import { jsonWrite } from '../../lib/api'
import { ensureOk, readApiError, toApiError } from '../../lib/api-errors'
import { isRepositoryName } from '../../lib/onboarding'
import { ROLES, canAdministerProject } from '../../lib/roles'

// A list longer than this gets a search box, unless it always has one.
const SEARCH_THRESHOLD = 5

// Mirrors the backend's SonarCloud project key rule.
const SONAR_KEY_PATTERN = /^[\w.:-]+$/
const SONAR_KEY_MAX = 255
const SONAR_KEY_FALLBACK =
  'The SonarCloud project key could not be saved. Try again later.'

/** Why a trimmed SonarCloud key cannot be saved, or null. Blank clears a set key. */
function sonarKeyError(key, hadKey) {
  if (!key) return hadKey ? null : 'Enter a SonarCloud project key'
  if (key.length > SONAR_KEY_MAX) {
    return 'SonarCloud project key must be 255 characters or fewer'
  }
  if (!SONAR_KEY_PATTERN.test(key)) {
    return 'SonarCloud project key must only contain letters, numbers, dots, colons, hyphens and underscores'
  }
  return null
}

/** A repository table in a scrolling container, with a search box once it is long. */
function SearchableTable({
  noun,
  items,
  alwaysSearch = false,
  caption,
  head,
  searchText,
  toRow
}) {
  const [query, setQuery] = useState('')
  const searchable = alwaysSearch || items.length > SEARCH_THRESHOLD
  const needle = searchable ? query.trim().toLowerCase() : ''
  const shown = needle
    ? items.filter((item) => searchText(item).toLowerCase().includes(needle))
    : items

  let result = ''
  if (needle) {
    result =
      shown.length === 0
        ? `No ${noun} match “${query.trim()}”`
        : `Showing ${shown.length} of ${items.length} ${noun}`
  }

  return (
    <>
      {searchable && (
        <>
          <TextInput
            type="search"
            label={`Search ${noun}`}
            labelSize="s"
            width="30"
            spellCheck={false}
            autoComplete="off"
            formGroupClassName="govuk-!-margin-bottom-2"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p
            className={cx('govuk-hint', !needle && 'govuk-visually-hidden')}
            role="status"
          >
            {result}
          </p>
        </>
      )}
      {shown.length > 0 && (
        <div className="app-scroll-list">
          <Table
            className="govuk-!-margin-bottom-0"
            caption={caption}
            captionHidden
            head={head}
            rows={shown.map(toRow)}
          />
        </div>
      )}
    </>
  )
}

const ACTIONS_HEAD = {
  id: 'actions',
  label: <span className="govuk-visually-hidden">Actions</span>
}

/**
 * Which repositories feed the active project, in separate sections: those
 * connected, a form to add one, those sending data with no project, and those
 * in other projects. Project admins add repositories nobody owns yet and remove
 * their own; moving one between projects needs a dashboard admin, so only they
 * see the other projects' repositories.
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
  const [repository, setRepository] = useState('')
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [keyEdit, setKeyEdit] = useState(null)
  const [keySaving, setKeySaving] = useState(false)
  const keyInFlight = useRef(false)
  const keyInputRef = useRef(null)
  const returnFocusTo = useRef(null)
  const keyInputId = `${inputId}-sonar`

  const isDashboardAdmin = role === ROLES.dashboardAdmin
  const canEditKeys = canAdministerProject(role)
  const mine = repositories.filter((r) => r.projectSlug === project.slug)
  const elsewhere = repositories.filter((r) => r.projectSlug !== project.slug)
  const suggestions = unassigned.filter(isRepositoryName)
  const editingName = keyEdit?.fullName

  useEffect(() => {
    if (editingName) keyInputRef.current?.focus()
  }, [editingName])

  const fail = (message) => {
    setAttempt((n) => n + 1)
    setError(message)
  }

  const startKeyEdit = (r) => {
    setError(null)
    setNotice(null)
    setKeyEdit({
      fullName: r.fullName,
      hadKey: Boolean(r.sonarProjectKey),
      value: r.sonarProjectKey ?? '',
      error: null
    })
  }

  const closeKeyEdit = () => {
    returnFocusTo.current = editingName
    setKeyEdit(null)
  }

  const keyFailed = (message) => {
    setAttempt((n) => n + 1)
    setKeyEdit((edit) => edit && { ...edit, error: message })
  }

  // The Change/Add button regains focus when it remounts after an edit closes.
  const keyButtonRef = (fullName) => (element) => {
    if (element && returnFocusTo.current === fullName) {
      returnFocusTo.current = null
      element.focus()
    }
  }

  const saveKey = async (fullName, key) => {
    if (keyInFlight.current) return
    keyInFlight.current = true
    setKeySaving(true)
    setNotice(null)
    try {
      const res = await jsonWrite(
        `/api/repositories/${encodeURIComponent(fullName)}/sonar-key`,
        'PUT',
        { sonarProjectKey: key }
      )
      if (!res.ok) {
        const { message } = await readApiError(res, {
          context: 'sonarKey',
          fallback: SONAR_KEY_FALLBACK,
          notFound: `${fullName} is no longer connected to a project`
        })
        keyFailed(message)
        return
      }
      returnFocusTo.current = fullName
      setKeyEdit(null)
      setNotice({
        id: Date.now(),
        focus: false,
        text: key
          ? `SonarCloud project key for ${fullName} saved`
          : `SonarCloud project key removed from ${fullName}`
      })
      onChanged()
    } catch {
      keyFailed(SONAR_KEY_FALLBACK)
    } finally {
      keyInFlight.current = false
      setKeySaving(false)
    }
  }

  const submitKey = (event) => {
    event.preventDefault()
    const key = keyEdit.value.trim()
    const problem = sonarKeyError(key, keyEdit.hadKey)
    if (problem) {
      keyFailed(problem)
      return
    }
    saveKey(keyEdit.fullName, key || null)
  }

  const map = async (fullName, verb) => {
    setError(null)
    setNotice(null)
    setPending(fullName)
    const fallback = `${fullName} could not be ${verb}`
    try {
      const res = await jsonWrite(
        `/api/repositories/${encodeURIComponent(fullName)}`,
        'PUT',
        { projectSlug: project.slug }
      )
      await ensureOk(res, { fallback })
      setNotice({ id: Date.now(), text: `${fullName} ${verb}` })
      setRepository('')
      onChanged()
    } catch (err) {
      fail(toApiError(err, fallback).message)
    } finally {
      setPending(null)
    }
  }

  const unmap = async (fullName) => {
    setError(null)
    setNotice(null)
    setPending(fullName)
    const fallback = `${fullName} could not be removed`
    try {
      const res = await jsonWrite(
        `/api/repositories/${encodeURIComponent(fullName)}`,
        'DELETE'
      )
      await ensureOk(res, {
        fallback,
        notFound: `${fullName} is no longer connected to a project`
      })
      setConfirming(null)
      setNotice({
        id: Date.now(),
        text: `${fullName} removed from the project`
      })
      onChanged()
    } catch (err) {
      setConfirming(null)
      fail(toApiError(err, fallback).message)
    } finally {
      setPending(null)
    }
  }

  const add = (text) => {
    const name = text.trim()
    if (!isRepositoryName(name)) {
      fail('Enter the repository as owner/name, like DEFRA/mmo-cr-pdf')
      return
    }
    const key = name.toLowerCase()
    if (mine.some((r) => r.fullName.toLowerCase() === key)) {
      fail(`${name} is already in this project`)
      return
    }
    if (elsewhere.some((r) => r.fullName.toLowerCase() === key)) {
      fail(
        isDashboardAdmin
          ? `${name} is in another project. Use Move here to bring it into this one`
          : `${name} is already mapped to a project`
      )
      return
    }
    map(name, 'added to the project')
  }

  const submit = (event) => {
    event.preventDefault()
    add(repository)
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

  const sectionGap = 'govuk-!-margin-bottom-6'

  let problem = null
  if (keyEdit?.error) problem = { href: `#${keyInputId}`, text: keyEdit.error }
  else if (error) problem = { href: `#${inputId}`, text: error }

  const sonarKeyCell = (r) => {
    if (editingName === r.fullName) {
      return (
        <form key="edit" onSubmit={submitKey} noValidate>
          <TextInput
            id={keyInputId}
            ref={keyInputRef}
            label="SonarCloud project key"
            labelSize="s"
            hint="The key shown in SonarCloud, for example DEFRA_my-repo. Each key can belong to one repository only."
            errorMessage={keyEdit.error ?? undefined}
            spellCheck={false}
            autoComplete="off"
            value={keyEdit.value}
            onChange={(event) =>
              setKeyEdit({ ...keyEdit, value: event.target.value })
            }
          />
          <div className="govuk-button-group govuk-!-margin-bottom-0">
            <Button type="submit" disabled={keySaving}>
              Save
            </Button>
            {keyEdit.hadKey && (
              <Button
                variant="warning"
                disabled={keySaving}
                onClick={() => saveKey(r.fullName, null)}
              >
                Remove key
              </Button>
            )}
            <button
              type="button"
              className="app-link-button"
              disabled={keySaving}
              onClick={closeKeyEdit}
            >
              Cancel
            </button>
          </div>
        </form>
      )
    }
    return (
      <span key="key">
        {r.sonarProjectKey ? (
          <code className="app-code">{r.sonarProjectKey}</code>
        ) : (
          '—'
        )}
        {canEditKeys && (
          <>
            {' '}
            <button
              ref={keyButtonRef(r.fullName)}
              type="button"
              className="app-link-button govuk-!-margin-left-2"
              onClick={() => startKeyEdit(r)}
            >
              {r.sonarProjectKey ? 'Change' : 'Add'}
              <span className="govuk-visually-hidden">
                {' '}
                SonarCloud project key for {r.fullName}
              </span>
            </button>
          </>
        )}
      </span>
    )
  }

  return (
    <>
      {notice && (
        <NotificationBanner
          key={notice.id}
          type="success"
          autoFocus={notice.focus !== false}
        >
          {notice.text}
        </NotificationBanner>
      )}
      {problem && <ErrorSummary key={attempt} errors={[problem]} />}

      <Panel
        title="Connected Repositories"
        family="speed"
        icon="repo"
        headingLevel={2}
        busy={state() === 'loading'}
        className={sectionGap}
      >
        <p className="govuk-body-s">
          Repositories that send data to this project.
        </p>
        <PanelState
          state={state()}
          title="Connected repositories"
          icon="repo"
          emptyTag="No repositories"
          emptyMessage="No repository sends data to this project yet. Add one below."
          errorMessage="We could not load the repositories. Try again later."
        >
          <SearchableTable
            noun="connected repositories"
            items={mine}
            caption="Connected repositories"
            head={[
              { id: 'repo', label: 'Repository' },
              { id: 'sonar', label: 'SonarCloud project key' },
              ACTIONS_HEAD
            ]}
            searchText={(r) => `${r.fullName} ${r.sonarProjectKey ?? ''}`}
            toRow={(r) => ({
              id: r.fullName,
              cells: [
                r.fullName,
                sonarKeyCell(r),
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
            })}
          />
        </PanelState>
      </Panel>

      <Panel
        title="Add a Repository"
        family="speed"
        icon="repo"
        headingLevel={2}
        className={sectionGap}
      >
        <form onSubmit={submit} noValidate>
          <Combobox
            id={inputId}
            label="Repository name"
            labelSize="s"
            hint="As owner/name, like DEFRA/mmo-cr-pdf. Pick a discovered repository or type a new one. Map it before adding the analytics workflow, or its data is held back."
            errorMessage={error ?? undefined}
            value={repository}
            onChange={setRepository}
            options={suggestions}
            onSelect={add}
            allowCustom
            itemName="repository"
            itemNamePlural="repositories"
          />
          <Button type="submit" disabled={pending !== null}>
            Add repository
          </Button>
        </form>
      </Panel>

      {unassigned.length > 0 && (
        <Panel
          title="Discovered Repositories"
          family="speed"
          icon="repo"
          headingLevel={2}
          className={sectionGap}
        >
          <p className="govuk-body-s">
            Repositories sending telemetry that have not yet been assigned to a
            project.
          </p>
          <SearchableTable
            noun="discovered repositories"
            items={unassigned}
            caption="Discovered repositories"
            head={[{ id: 'repo', label: 'Repository' }, ACTIONS_HEAD]}
            searchText={(name) => name}
            toRow={(name) => ({
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
            })}
          />
        </Panel>
      )}

      {isDashboardAdmin && elsewhere.length > 0 && (
        <Panel
          title="Repos Mapped"
          family="speed"
          icon="repo"
          headingLevel={2}
          className={sectionGap}
        >
          <p className="govuk-body-s">
            Repositories currently assigned to other projects.
          </p>
          <SearchableTable
            noun="mapped repositories"
            items={elsewhere}
            alwaysSearch
            caption="Repositories mapped to other projects"
            head={[
              { id: 'repo', label: 'Repository' },
              { id: 'project', label: 'Project' },
              ACTIONS_HEAD
            ]}
            searchText={(r) => `${r.fullName} ${r.projectSlug}`}
            toRow={(r) => ({
              id: r.fullName,
              cells: [
                r.fullName,
                <code key="p" className="app-code">
                  {r.projectSlug}
                </code>,
                linkButton(
                  'Move here',
                  `${r.fullName} to ${project.name}`,
                  () => map(r.fullName, 'moved to this project'),
                  pending === r.fullName
                )
              ]
            })}
          />
        </Panel>
      )}
    </>
  )
}
