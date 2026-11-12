import { useEffect, useId, useRef, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  ErrorSummary,
  NotificationBanner,
  Radios,
  Select,
  Table
} from '../govuk'
import { cx } from '../govuk/utils.js'
import { useRoleMappings } from '../../hooks/useRoleMappings'
import { HTTP } from '../../lib/http-status.js'

const ADMIN = 'Dashboard.Admin'
const GROUP_NAME = 'group-name'
const ROLE_ITEMS = [
  { value: ADMIN, text: 'Dashboard Admin' },
  { value: 'project-admin', text: 'Project Admin' },
  { value: 'project-user', text: 'Project User' }
]
const ROLE_LABEL = Object.fromEntries(ROLE_ITEMS.map((r) => [r.value, r.text]))
const MAX_GROUP_NAME = 256
const MAX_DESCRIPTION = 500

function groupNameError(name) {
  if (!name) {
    return 'Enter a group name'
  }
  return name.length > MAX_GROUP_NAME
    ? `Group name must be ${MAX_GROUP_NAME} characters or fewer`
    : null
}

function validate(form) {
  const errors = {}
  const nameError = groupNameError(form.groupName.trim())
  if (nameError) {
    errors.groupName = nameError
  }
  if (!ROLE_LABEL[form.role]) {
    errors.role = 'Select a role'
  }
  if (ROLE_LABEL[form.role] && form.role !== ADMIN && !form.projectSlug) {
    errors.projectSlug = 'Select a project'
  }
  if (form.description.length > MAX_DESCRIPTION) {
    errors.description = `Description must be ${MAX_DESCRIPTION} characters or fewer`
  }
  return errors
}

const mappingPayload = (form) => ({
  groupName: form.groupName.trim(),
  role: form.role,
  ...(form.role !== ADMIN && { projectSlug: form.projectSlug }),
  ...(form.description.trim() && { description: form.description.trim() })
})

function mappingsState(status, mappings) {
  if (status === 'loading' || status === 'idle') {
    return 'loading'
  }
  if (status === 'error') {
    return 'error'
  }
  return mappings.length === 0 ? 'empty' : 'populated'
}

function FieldError({ id, children }) {
  if (!children) {
    return null
  }
  return (
    <p id={id} className="govuk-error-message">
      <span className="govuk-visually-hidden">Error:</span> {children}
    </p>
  )
}

function GroupNameField({ fieldId, error, value, onChange }) {
  const id = fieldId(GROUP_NAME)
  return (
    <div className={cx('govuk-form-group', error && 'govuk-form-group--error')}>
      <label className="govuk-label govuk-label--s" htmlFor={id}>
        Group Name
      </label>
      <div id={`${id}-hint`} className="govuk-hint">
        The group’s display name in Microsoft Entra, matched exactly and
        case-sensitively. Display names can be changed or reused in Entra, so
        check the name before you add it and update the mapping if the group is
        renamed.
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
      <input
        className={cx(
          'govuk-input govuk-input--width-30',
          error && 'govuk-input--error'
        )}
        id={id}
        type="text"
        spellCheck={false}
        autoComplete="off"
        aria-describedby={cx(`${id}-hint`, error && `${id}-error`)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function DescriptionField({ fieldId, error, value, onChange }) {
  const id = fieldId('description')
  return (
    <div className={cx('govuk-form-group', error && 'govuk-form-group--error')}>
      <label className="govuk-label" htmlFor={id}>
        Description (Optional)
      </label>
      <FieldError id={`${id}-error`}>{error}</FieldError>
      <input
        className={cx('govuk-input', error && 'govuk-input--error')}
        id={id}
        type="text"
        autoComplete="off"
        aria-describedby={error ? `${id}-error` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function RemoveButton({ mapping, lastAdmin, buttonRef, onRemove }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="app-link-button"
      aria-disabled={lastAdmin || undefined}
      title={
        lastAdmin
          ? 'The last Dashboard Admin mapping cannot be removed'
          : undefined
      }
      onClick={() => {
        if (!lastAdmin) {
          onRemove(mapping)
        }
      }}
    >
      {'Remove'}
      <span className="govuk-visually-hidden">
        {` mapping for ${mapping.groupName}`}
      </span>
    </button>
  )
}

const EMPTY_FORM = {
  groupName: '',
  role: '',
  projectSlug: '',
  description: ''
}

function RemoveConfirmation({ mapping, pending, onConfirm, onCancel }) {
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="govuk-!-margin-bottom-6">
      <h3 className="govuk-heading-s" ref={headingRef} tabIndex={-1}>
        Are you sure you want to remove the mapping for {mapping.groupName}?
      </h3>
      <p className="govuk-body">
        People in this group lose the access it gives them the next time they
        sign in or their session is refreshed.
      </p>
      <div className="govuk-button-group">
        <Button variant="warning" disabled={pending} onClick={onConfirm}>
          Remove mapping
        </Button>
        <button
          type="button"
          className="app-link-button"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Which Microsoft Entra groups grant which role. Only a Dashboard Admin sees
 * this; groups are matched on their display name, so a renamed group stops
 * matching until its mapping is updated.
 */
export function RoleMappingsPanel({ projects = [] }) {
  const baseId = useId()
  const { mappings, status, refresh, create, remove } = useRoleMappings()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const removeButtons = useRef({})
  const lastRemoved = useRef(null)

  const fieldId = (name) => `${baseId}-${name}`.replaceAll(':', '')
  const needsProject = form.role && form.role !== ADMIN
  const adminCount = mappings.filter((m) => m.role === ADMIN).length

  useEffect(() => {
    if (lastRemoved.current === null) {
      return
    }
    lastRemoved.current = null
    document.getElementById(fieldId(GROUP_NAME))?.focus()
  })

  const set = (name) => (value) => setForm((f) => ({ ...f, [name]: value }))

  const fail = (nextErrors, message) => {
    setAttempt((n) => n + 1)
    setErrors(nextErrors)
    setServerError(message ?? null)
  }

  const submit = async (event) => {
    event.preventDefault()
    setNotice(null)
    const found = validate(form)
    if (Object.keys(found).length > 0) {
      fail(found)
      return
    }

    setSaving(true)
    setErrors({})
    setServerError(null)
    try {
      await create(mappingPayload(form))
      setNotice({
        id: Date.now(),
        text: `Mapping for ${form.groupName.trim()} added`
      })
      setForm(EMPTY_FORM)
    } catch (err) {
      fail(
        {},
        err.status === HTTP.conflict
          ? 'A mapping for that group, role and project already exists'
          : err.message
      )
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = async () => {
    setSaving(true)
    setServerError(null)
    try {
      await remove(confirming.id)
      setNotice({
        id: Date.now(),
        text: `Mapping for ${confirming.groupName} removed`
      })
      lastRemoved.current = confirming.id
      setConfirming(null)
    } catch (err) {
      setConfirming(null)
      fail({}, err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelRemove = () => {
    const id = confirming.id
    setConfirming(null)
    setTimeout(() => removeButtons.current[id]?.focus(), 0)
  }

  const summary = [
    ...Object.entries(errors).map(([name, text]) => ({
      href: `#${fieldId(name === 'groupName' ? GROUP_NAME : name)}`,
      text
    })),
    ...(serverError ? [{ text: serverError }] : [])
  ]

  const projectOptions = [
    { value: '', text: 'Select a project' },
    ...projects.map((p) => ({ value: p.slug, text: `${p.name} (${p.slug})` }))
  ]

  const state = mappingsState(status, mappings)
  const startRemove = (mapping) => {
    setNotice(null)
    setConfirming(mapping)
  }

  return (
    <Panel
      title="Role Mappings"
      family="adoption"
      icon="users"
      headingLevel={2}
    >
      {notice && (
        <NotificationBanner key={notice.id} type="success" autoFocus>
          {notice.text}
        </NotificationBanner>
      )}
      {summary.length > 0 && <ErrorSummary key={attempt} errors={summary} />}

      <p className="govuk-body-s">
        Anyone in a mapped Microsoft Entra group gets the role shown. Add people
        to the group in Entra, not here.
      </p>

      {confirming && (
        <RemoveConfirmation
          mapping={confirming}
          pending={saving}
          onConfirm={confirmRemove}
          onCancel={cancelRemove}
        />
      )}

      <PanelState
        state={state}
        title="Role Mappings"
        icon="users"
        emptyTag="No Mappings"
        emptyMessage="No group has been mapped to a role, so only the bootstrap admin group can sign in."
        errorMessage="We could not load the role mappings. Try again later."
        onRetry={refresh}
      >
        <Table
          caption="Role mappings"
          captionHidden
          head={[
            { id: 'group', label: 'Group Name' },
            { id: 'role', label: 'Role' },
            { id: 'project', label: 'Project' },
            {
              id: 'actions',
              label: <span className="govuk-visually-hidden">Actions</span>
            }
          ]}
          rows={mappings.map((m) => {
            const lastAdmin = m.role === ADMIN && adminCount === 1
            return {
              id: m.id,
              cells: [
                m.groupName,
                ROLE_LABEL[m.role] ?? m.role,
                m.projectSlug ?? 'All Projects',
                <RemoveButton
                  key="remove"
                  mapping={m}
                  lastAdmin={lastAdmin}
                  buttonRef={(el) => {
                    removeButtons.current[m.id] = el
                  }}
                  onRemove={startRemove}
                />
              ]
            }
          })}
        />
      </PanelState>

      <form onSubmit={submit} noValidate>
        <h3 className="govuk-heading-s govuk-!-margin-top-6">Add a Mapping</h3>
        <GroupNameField
          fieldId={fieldId}
          error={errors.groupName}
          value={form.groupName}
          onChange={set('groupName')}
        />

        <Radios
          idPrefix={fieldId('role')}
          name="role"
          legend="Role"
          legendSize="s"
          errorMessage={errors.role}
          items={ROLE_ITEMS}
          value={form.role}
          onChange={set('role')}
        />

        {needsProject && (
          <Select
            id={fieldId('projectSlug')}
            label="Project"
            errorMessage={errors.projectSlug}
            options={projectOptions}
            value={form.projectSlug}
            onChange={(e) => set('projectSlug')(e.target.value)}
          />
        )}

        <DescriptionField
          fieldId={fieldId}
          error={errors.description}
          value={form.description}
          onChange={set('description')}
        />

        <Button type="submit" disabled={saving}>
          Add Mapping
        </Button>
      </form>
    </Panel>
  )
}
