import { useEffect, useRef, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  ErrorMessage,
  ErrorSummary,
  Hint,
  InsetText,
  NotificationBanner,
  Radios,
  Table,
  Tag
} from '../govuk'
import { cx } from '../govuk/utils.js'
import { AuditLogPanel } from '../AuditLogPanel'
import { RoleMappingsPanel } from '../settings/RoleMappingsPanel'
import { RepositoryMappingPanel } from '../settings/RepositoryMappingPanel'
import { useRepositories } from '../../hooks/useRepositories'
import { PERSONAS, personaMeta } from '../../lib/personas'
import { ROLE_LABEL, canAdministerProject } from '../../lib/roles'

// Mirrors GitHub's own username rules: alphanumeric, single hyphens, no leading/trailing hyphen.
const GITHUB_HANDLE_PATTERN = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/

const HANDLE_ID = 'github-handle'
const PERSONA_ID = 'persona'
const PERSONA_IDS = new Set(PERSONAS.map((p) => p.id))
const PERSONA_TAG = { developer: 'purple', devops: 'blue', qa: 'green' }
const PERSONA_ITEMS = PERSONAS.map((p) => ({ value: p.id, text: p.label }))

const isValidMapping = (m) =>
  typeof m?.githubHandle === 'string' && PERSONA_IDS.has(m.persona)

function validate(handle, persona) {
  const errors = {}
  if (!handle) {
    errors.handle = 'Enter a GitHub handle'
  } else if (!GITHUB_HANDLE_PATTERN.test(handle)) {
    errors.handle =
      'GitHub handle must only include letters, numbers and single hyphens, like octocat'
  }
  if (!PERSONA_IDS.has(persona)) errors.persona = 'Select a persona'
  return errors
}

function DeleteConfirmation({ handle, pending, onConfirm, onCancel }) {
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="govuk-!-margin-bottom-6">
      <h3 className="govuk-heading-s" ref={headingRef} tabIndex={-1}>
        Are you sure you want to delete the persona mapping for {handle}?
      </h3>
      <p className="govuk-body">
        Their pull requests will count as Developers until they are mapped
        again.
      </p>
      <div className="govuk-button-group">
        <Button variant="warning" disabled={pending} onClick={onConfirm}>
          {pending ? 'Deleting…' : 'Delete mapping'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/**
 * Settings for the active project. Project admins manage who counts as which
 * delivery persona, who can read the project and which repositories feed it;
 * a project user sees only the project's audit log.
 */
export function SettingsView({
  project,
  role,
  mappings,
  status,
  onSave,
  onRemove,
  projects = [],
  isDashboardAdmin = false,
  contributors = []
}) {
  const canAdminister = canAdministerProject(role)
  const repos = useRepositories(canAdminister)
  const handleRepositoriesChanged = repos.refresh
  const [handle, setHandle] = useState('')
  const [persona, setPersona] = useState(undefined)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [notice, setNotice] = useState(null)
  const handleRef = useRef(null)

  const rows = mappings.filter(isValidMapping)
  const mapped = new Set(rows.map((m) => m.githubHandle.toLowerCase()))
  const suggestions = contributors.filter(
    (name) => !mapped.has(name.toLowerCase())
  )
  const errorList = [
    errors.handle && { href: `#${HANDLE_ID}`, text: errors.handle },
    errors.persona && { href: `#${PERSONA_ID}`, text: errors.persona },
    errors.remove && { text: errors.remove }
  ].filter(Boolean)

  const resetForm = () => {
    setHandle('')
    setPersona(undefined)
    setEditing(null)
    setErrors({})
  }

  const submit = async (event) => {
    event.preventDefault()
    const trimmed = handle.trim()
    const found = validate(trimmed, persona)
    setNotice(null)
    setAttempt((n) => n + 1)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setPending(true)
    try {
      await onSave(trimmed, persona)
      resetForm()
      setNotice({
        id: Date.now(),
        text: `Persona mapping for ${trimmed} saved`
      })
    } catch (err) {
      setAttempt((n) => n + 1)
      setErrors({ handle: err.message || 'The mapping could not be saved' })
    } finally {
      setPending(false)
    }
  }

  const startChange = (mapping) => {
    setConfirming(null)
    setNotice(null)
    setErrors({})
    setEditing(mapping.githubHandle)
    setHandle(mapping.githubHandle)
    setPersona(mapping.persona)
    handleRef.current?.focus()
  }

  const confirmDelete = async () => {
    const target = confirming
    setRemoving(true)
    try {
      await onRemove(target)
      setConfirming(null)
      setErrors({})
      setNotice({
        id: Date.now(),
        text: `Persona mapping for ${target} deleted`
      })
    } catch {
      setAttempt((n) => n + 1)
      setErrors({
        remove: `The persona mapping for ${target} could not be deleted. Try again.`
      })
    } finally {
      setRemoving(false)
    }
  }

  const mappingsState = () => {
    if (rows.length > 0) return 'populated'
    if (status === 'error') return 'error'
    if (status === 'loading' || status === 'idle') return 'loading'
    return 'empty'
  }

  if (!canAdminister) {
    return (
      <>
        <InsetText>
          You are a {(ROLE_LABEL[role] ?? 'project user').toLowerCase()} on{' '}
          {project?.name}. You can read this project’s audit log. Changing
          settings needs a project admin.
        </InsetText>
        <AuditLogPanel projectSlug={project?.slug} />
      </>
    )
  }

  return (
    <>
      {notice && (
        <NotificationBanner key={notice.id} type="success" autoFocus>
          {notice.text}
        </NotificationBanner>
      )}
      {errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
      )}

      <div className="app-grid">
        <div className="app-span-6">
          <Panel
            title={
              editing ? 'Change a persona mapping' : 'Add a persona mapping'
            }
            family="adoption"
            icon="person"
            headingLevel={2}
          >
            <form onSubmit={submit} noValidate>
              <div
                className={cx(
                  'govuk-form-group',
                  errors.handle && 'govuk-form-group--error'
                )}
              >
                <label className="govuk-label" htmlFor={HANDLE_ID}>
                  GitHub handle
                </label>
                <Hint id={`${HANDLE_ID}-hint`}>
                  Choose a contributor from this project or type a new handle,
                  for example octocat. Handles without a mapping count as
                  Developers.
                </Hint>
                {errors.handle && (
                  <ErrorMessage id={`${HANDLE_ID}-error`}>
                    {errors.handle}
                  </ErrorMessage>
                )}
                <input
                  ref={handleRef}
                  className={cx(
                    'govuk-input govuk-input--width-20',
                    errors.handle && 'govuk-input--error'
                  )}
                  id={HANDLE_ID}
                  name="githubHandle"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby={cx(
                    `${HANDLE_ID}-hint`,
                    errors.handle && `${HANDLE_ID}-error`
                  )}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  list={
                    suggestions.length > 0 ? `${HANDLE_ID}-list` : undefined
                  }
                />
                {suggestions.length > 0 && (
                  <datalist id={`${HANDLE_ID}-list`}>
                    {suggestions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                )}
              </div>
              <Radios
                idPrefix={PERSONA_ID}
                name="persona"
                legend="Persona"
                legendSize="s"
                hint="The delivery role this person's pull requests count towards."
                errorMessage={errors.persona}
                items={PERSONA_ITEMS}
                value={persona ?? null}
                onChange={setPersona}
              />
              <div className="govuk-button-group">
                <Button type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Save mapping'}
                </Button>
                {editing && (
                  <Button variant="secondary" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Panel>
        </div>

        <div className="app-span-6">
          <Panel
            title="Persona mappings"
            family="adoption"
            icon="users"
            headingLevel={2}
            busy={mappingsState() === 'loading'}
          >
            {status === 'error' && rows.length > 0 && (
              <NotificationBanner headingLevel={3}>
                We could not refresh persona mappings. Showing the last list
                loaded.
              </NotificationBanner>
            )}
            {confirming && (
              <DeleteConfirmation
                handle={confirming}
                pending={removing}
                onConfirm={confirmDelete}
                onCancel={() => setConfirming(null)}
              />
            )}
            <PanelState
              state={mappingsState()}
              title="Persona mappings"
              icon="users"
              emptyTag="No mappings yet"
              emptyMessage="Every contributor counts as Developers until they are mapped."
              errorMessage="We could not load persona mappings. Try again later."
            >
              <Table
                className="govuk-!-margin-bottom-0"
                caption="Persona mappings by GitHub handle"
                captionHidden
                head={[
                  { id: 'handle', label: 'GitHub handle' },
                  { id: 'persona', label: 'Persona' },
                  {
                    id: 'actions',
                    label: (
                      <span className="govuk-visually-hidden">Actions</span>
                    )
                  }
                ]}
                rows={rows.map((m) => ({
                  id: m.githubHandle,
                  cells: [
                    m.githubHandle,
                    <Tag key="persona" colour={PERSONA_TAG[m.persona]}>
                      {personaMeta(m.persona).label}
                    </Tag>,
                    m.scope === 'default' ? (
                      <span key="actions" className="app-muted">
                        Default for every project
                      </span>
                    ) : (
                      <span key="actions">
                        <button
                          type="button"
                          className="app-link-button"
                          onClick={() => startChange(m)}
                        >
                          Change
                          <span className="govuk-visually-hidden">
                            {' '}
                            persona for {m.githubHandle}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="app-link-button govuk-!-margin-left-3"
                          onClick={() => {
                            setNotice(null)
                            setConfirming(m.githubHandle)
                          }}
                        >
                          Delete
                          <span className="govuk-visually-hidden">
                            {' '}
                            persona mapping for {m.githubHandle}
                          </span>
                        </button>
                      </span>
                    )
                  ]
                }))}
              />
            </PanelState>
          </Panel>
        </div>
      </div>

      <div className="app-grid govuk-!-margin-top-6">
        {isDashboardAdmin && (
          <div className="app-span-6">
            <RoleMappingsPanel projects={projects} />
          </div>
        )}
        <div className={isDashboardAdmin ? 'app-span-6' : 'app-span-12'}>
          <RepositoryMappingPanel
            project={project}
            role={role}
            repositories={repos.repositories}
            unassigned={repos.unassigned}
            status={repos.status}
            onChanged={handleRepositoriesChanged}
          />
        </div>
      </div>

      <div className="govuk-!-margin-top-6">
        <AuditLogPanel projectSlug={project?.slug} />
      </div>
    </>
  )
}
