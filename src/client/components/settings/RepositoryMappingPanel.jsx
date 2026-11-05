import { useId, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  ErrorSummary,
  NotificationBanner,
  Table,
  TextInput
} from '../govuk'
import { cx } from '../govuk/utils.js'
import { jsonWrite } from '../../lib/api'
import { isRepositoryName } from '../../lib/onboarding'
import { ROLES } from '../../lib/roles'

// A list longer than this gets a search box, unless it always has one.
const SEARCH_THRESHOLD = 5

async function failure(res, fallback) {
  const body = await res.json().catch(() => null)
  return new Error(body?.message || fallback)
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

  const isDashboardAdmin = role === ROLES.dashboardAdmin
  const mine = repositories.filter((r) => r.projectSlug === project.slug)
  const elsewhere = repositories.filter((r) => r.projectSlug !== project.slug)
  const suggestions = unassigned.filter(isRepositoryName)

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

  return (
    <>
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
              { id: 'sonar', label: 'Sonar project key' },
              ACTIONS_HEAD
            ]}
            searchText={(r) => `${r.fullName} ${r.sonarProjectKey ?? ''}`}
            toRow={(r) => ({
              id: r.fullName,
              cells: [
                r.fullName,
                r.sonarProjectKey ? (
                  <code key="k" className="app-code">
                    {r.sonarProjectKey}
                  </code>
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
          <TextInput
            id={inputId}
            label="Repository name"
            labelSize="s"
            hint="As owner/name, like DEFRA/mmo-cr-pdf. Pick a discovered repository or type a new one. Map it before adding the analytics workflow, or its data is held back."
            errorMessage={error ?? undefined}
            width="30"
            spellCheck={false}
            autoComplete="off"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            list={suggestions.length > 0 ? `${inputId}-list` : undefined}
          />
          {suggestions.length > 0 && (
            <datalist id={`${inputId}-list`}>
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          )}
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
