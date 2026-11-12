import { useEffect, useRef, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  Combobox,
  ErrorSummary,
  NotificationBanner,
  Radios,
  Table,
  Tag
} from '../govuk'
import { PERSONAS, personaMeta } from '../../lib/personas'

// The git config author name, so free text; it is a URL path segment, hence no slashes or dot segments.
const HANDLE_MAX_LENGTH = 100
const HANDLE_PATTERN = /^(?!\.{1,2}$)[^/\\\p{Cc}]+$/u

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
  } else if (handle.length > HANDLE_MAX_LENGTH) {
    errors.handle = `GitHub handle must be ${HANDLE_MAX_LENGTH} characters or fewer`
  } else if (!HANDLE_PATTERN.test(handle)) {
    errors.handle =
      'GitHub handle must not include / or \\, and must not be . or ..'
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

/** Who counts as which delivery persona: the form and the current mappings. */
export function PersonaMappingsSection({
  mappings,
  status,
  onSave,
  onRemove,
  contributors = []
}) {
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
              <Combobox
                id={HANDLE_ID}
                label="GitHub handle"
                hint="Choose a contributor from this project or type the name they commit with, as set in their git config. Names without a mapping count as Developers."
                errorMessage={errors.handle}
                className="govuk-input--width-20"
                inputRef={handleRef}
                value={handle}
                onChange={setHandle}
                onSelect={setHandle}
                options={suggestions}
                itemName="contributor"
                itemNamePlural="contributors"
              />
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
                  ]
                }))}
              />
            </PanelState>
          </Panel>
        </div>
      </div>
    </>
  )
}
