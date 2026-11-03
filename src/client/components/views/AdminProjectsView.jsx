import { useCallback, useEffect, useId, useState } from 'react'

import {
  BackLink,
  Button,
  DateInput,
  ErrorSummary,
  NotificationBanner,
  Radios,
  Select,
  SummaryList,
  Table,
  Tag
} from '../govuk'
import { cx } from '../govuk/utils.js'
import { apiFetch, jsonWrite } from '../../lib/api'

const SLUG_PATTERN = /^[A-Z][A-Z0-9]{2,3}$/
const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+$/

const TYPE_ITEMS = [
  {
    value: 'ai-adopted',
    text: 'AI-adopted',
    hint: 'An existing team adopting GitHub Copilot.'
  },
  {
    value: 'ai-native',
    text: 'AI-native',
    hint: 'A team building with an agentic delivery lifecycle from the start.'
  }
]

const EMPTY_FORM = {
  name: '',
  slug: '',
  type: '',
  adoption: { day: '', month: '', year: '' },
  jiraKeys: ''
}

const FIELD_IDS = {
  name: 'project-name',
  slug: 'project-slug',
  type: 'project-type',
  adoption: 'project-adoption',
  jiraKeys: 'project-jira-keys'
}

const typeLabel = (type) => (type === 'ai-native' ? 'AI-native' : 'AI-adopted')

const splitKeys = (value) =>
  value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)

function parseDate({ day, month, year }) {
  const d = Number(day)
  const m = Number(month)
  const y = Number(year)
  if (!Number.isInteger(d) || !Number.isInteger(m) || !/^\d{4}$/.test(year)) {
    return null
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  const real =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  return real ? date : null
}

/** Field errors for the create-project form, keyed by field. */
export function validateProject(form, now = new Date()) {
  const errors = {}
  const name = form.name.trim()
  if (!name) errors.name = 'Enter a project name'
  else if (name.length > 80) {
    errors.name = 'Project name must be 80 characters or fewer'
  }

  if (!form.slug) errors.slug = 'Enter a project slug'
  else if (!SLUG_PATTERN.test(form.slug)) {
    errors.slug =
      'Project slug must be 3 or 4 capital letters or numbers, starting with a letter, like CRAR'
  }

  if (!form.type) errors.type = 'Select the project type'

  const { day, month, year } = form.adoption
  const anyDate = day || month || year
  if (form.type === 'ai-adopted' && !anyDate) {
    errors.adoption = 'Enter the date the team adopted Copilot'
  } else if (anyDate) {
    const date = parseDate(form.adoption)
    if (!date) errors.adoption = 'Adoption start date must be a real date'
    else if (date > now) {
      errors.adoption = 'Adoption start date must be today or in the past'
    }
  }

  const keys = splitKeys(form.jiraKeys)
  if (keys.some((key) => !JIRA_KEY_PATTERN.test(key))) {
    errors.jiraKeys =
      'Jira project keys must be capital letters, numbers or underscores, separated by commas, like MMOCR, FES'
  }
  return errors
}

function toRequest(form) {
  const date = parseDate(form.adoption)
  return {
    name: form.name.trim(),
    slug: form.slug,
    type: form.type,
    ...(date && { adoptionStartDate: date.toISOString() }),
    jira: { projectKeys: splitKeys(form.jiraKeys) }
  }
}

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : 'Not set'

async function readList(res, key) {
  if (!res.ok) return []
  const data = await res.json()
  if (Array.isArray(data)) return data
  return Array.isArray(data?.[key]) ? data[key] : []
}

function TextField({ id, label, hint, error, value, onChange, width, list }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={cx('govuk-form-group', error && 'govuk-form-group--error')}>
      <label className="govuk-label govuk-label--s" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <div id={hintId} className="govuk-hint">
          {hint}
        </div>
      )}
      {error && (
        <p id={errorId} className="govuk-error-message">
          <span className="govuk-visually-hidden">Error:</span> {error}
        </p>
      )}
      <input
        className={cx(
          'govuk-input',
          width && `govuk-input--width-${width}`,
          error && 'govuk-input--error'
        )}
        id={id}
        type="text"
        spellCheck={false}
        list={list}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(' ') || undefined
        }
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function CreateProject({ onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState('form')
  const [submitError, setSubmitError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const handleContinue = (event) => {
    event.preventDefault()
    const found = validateProject(form)
    setErrors(found)
    setAttempt((a) => a + 1)
    if (Object.keys(found).length === 0) setStep('check')
  }

  const change = (fieldId) => (event) => {
    event.preventDefault()
    setStep('form')
    requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
  }

  const handleAdd = async () => {
    setSaving(true)
    setSubmitError(null)
    try {
      const res = await jsonWrite('/api/projects', 'POST', toRequest(form))
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || 'The project could not be added')
      }
      onCreated(form.name.trim())
      setForm(EMPTY_FORM)
      setErrors({})
      setStep('form')
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (step === 'check') {
    const date = parseDate(form.adoption)
    const row = (key, label, value, fieldId) => ({
      key: label,
      id: key,
      value,
      actions: [
        {
          href: `#${fieldId}`,
          text: 'Change',
          visuallyHiddenText: label.toLowerCase(),
          onClick: change(fieldId)
        }
      ]
    })
    return (
      <>
        <h3 className="govuk-heading-m">Check the project details</h3>
        {submitError && (
          <ErrorSummary errors={[{ text: submitError }]} key={submitError} />
        )}
        <SummaryList
          rows={[
            row('name', 'Project name', form.name.trim(), FIELD_IDS.name),
            row('slug', 'Project slug', form.slug, FIELD_IDS.slug),
            row('type', 'Project type', typeLabel(form.type), FIELD_IDS.type),
            row(
              'adoption',
              'Adoption start date',
              date ? formatDate(date.toISOString()) : 'Not set',
              `${FIELD_IDS.adoption}-day`
            ),
            row(
              'jira',
              'Jira project keys',
              splitKeys(form.jiraKeys).join(', ') || 'None',
              FIELD_IDS.jiraKeys
            )
          ]}
        />
        <Button onClick={handleAdd} disabled={saving}>
          Add project
        </Button>
      </>
    )
  }

  const errorList = [
    errors.name && { href: `#${FIELD_IDS.name}`, text: errors.name },
    errors.slug && { href: `#${FIELD_IDS.slug}`, text: errors.slug },
    errors.type && { href: `#${FIELD_IDS.type}`, text: errors.type },
    errors.adoption && {
      href: `#${FIELD_IDS.adoption}-day`,
      text: errors.adoption
    },
    errors.jiraKeys && {
      href: `#${FIELD_IDS.jiraKeys}`,
      text: errors.jiraKeys
    }
  ].filter(Boolean)

  return (
    <form onSubmit={handleContinue} noValidate>
      {errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
      )}
      <TextField
        id={FIELD_IDS.name}
        label="Project name"
        error={errors.name}
        value={form.name}
        onChange={set('name')}
      />
      <TextField
        id={FIELD_IDS.slug}
        label="Project slug"
        hint="Used in links. 3 or 4 capital letters or numbers, like CRAR."
        error={errors.slug}
        value={form.slug}
        onChange={set('slug')}
        width={20}
      />
      <Radios
        idPrefix={FIELD_IDS.type}
        name="project-type"
        legend="Project type"
        legendSize="s"
        errorMessage={errors.type}
        items={TYPE_ITEMS}
        value={form.type}
        onChange={set('type')}
      />
      <DateInput
        id={FIELD_IDS.adoption}
        legend="Adoption start date"
        legendSize="s"
        hint="The date the team started using Copilot. Required for AI-adopted projects. For example, 1 10 2025."
        errorMessage={errors.adoption}
        value={form.adoption}
        onChange={set('adoption')}
      />
      <TextField
        id={FIELD_IDS.jiraKeys}
        label="Jira project keys (optional)"
        hint="Separate keys with commas, like MMOCR, FES."
        error={errors.jiraKeys}
        value={form.jiraKeys}
        onChange={set('jiraKeys')}
        width={20}
      />
      <Button type="submit">Continue</Button>
    </form>
  )
}

const MODEL_FIELDS = [
  [
    'lineCap',
    'Line cap',
    'Lines at which the line component reaches its maximum'
  ],
  [
    'fileCap',
    'File cap',
    'Files at which the file component reaches its maximum'
  ],
  [
    'moduleCap',
    'Module cap',
    'Modules at which the module component reaches its maximum'
  ],
  ['hardCapLines', 'Hard cap: lines', 'More lines than this scores 100'],
  ['hardCapFiles', 'Hard cap: files', 'More files than this scores 100']
]
const WEIGHT_FIELDS = [
  ['lines', 'Lines weight'],
  ['files', 'Files weight'],
  ['modules', 'Modules weight']
]

const toFields = (model) => ({
  ...Object.fromEntries(
    MODEL_FIELDS.map(([key]) => [key, String(model?.[key] ?? '')])
  ),
  ...Object.fromEntries(
    WEIGHT_FIELDS.map(([key]) => [key, String(model?.weights?.[key] ?? '')])
  )
})

/** Validates the complexity model form; returns `{ errors, model }`. */
export function validateComplexityModel(fields) {
  const errors = {}
  const model = { weights: {} }
  for (const [key, label] of MODEL_FIELDS) {
    const value = Number(fields[key])
    if (!/^\d+$/.test(String(fields[key]).trim()) || value < 1) {
      errors[key] = `${label} must be a whole number of 1 or more`
    }
    model[key] = value
  }
  for (const [key, label] of WEIGHT_FIELDS) {
    const value = Number(fields[key])
    if (
      fields[key] === '' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      errors[key] = `${label} must be a number from 0 to 1`
    }
    model.weights[key] = value
  }
  const sum = WEIGHT_FIELDS.reduce((s, [key]) => s + model.weights[key], 0)
  if (
    !errors.lines &&
    !errors.files &&
    !errors.modules &&
    Math.abs(sum - 1) > 1e-6
  ) {
    errors.lines = 'The three weights must add up to 1'
  }
  return { errors, model }
}

function ComplexityModel({ projects, onSaved }) {
  const baseId = useId()
  const projectId = `${baseId}-project`
  const [slug, setSlug] = useState('')
  const [fields, setFields] = useState(null)
  const [version, setVersion] = useState(null)
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!slug) {
      setFields(null)
      return undefined
    }
    const controller = new AbortController()
    apiFetch(`/api/projects/${encodeURIComponent(slug)}/complexity-model`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then((res) => {
        if (!res.ok) throw new Error('The model could not be loaded')
        return res.json()
      })
      .then((model) => {
        setFields(toFields(model))
        setVersion(model.version ?? 1)
        setErrors({})
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setErrors({ project: err.message })
      })
    return () => controller.abort()
  }, [slug])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const { errors: found, model } = validateComplexityModel(fields)
    setErrors(found)
    setAttempt((a) => a + 1)
    if (Object.keys(found).length > 0) return
    try {
      const res = await jsonWrite(
        `/api/projects/${encodeURIComponent(slug)}/complexity-model`,
        'PUT',
        model
      )
      if (!res.ok) throw new Error('The model could not be saved')
      const saved = await res.json()
      setVersion(saved.version)
      onSaved(
        `Complexity model for ${slug} saved as version ${saved.version}. Recompute to rescore existing pull requests.`
      )
    } catch (err) {
      setErrors({ project: err.message })
    }
  }

  const idFor = (key) => `${baseId}-${key}`
  const errorList = [
    errors.project && { href: `#${projectId}`, text: errors.project },
    ...[...MODEL_FIELDS, ...WEIGHT_FIELDS]
      .filter(([key]) => errors[key])
      .map(([key]) => ({ href: `#${idFor(key)}`, text: errors[key] }))
  ].filter(Boolean)
  const setField = (key) => (value) =>
    setFields((f) => ({ ...f, [key]: value }))

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
      )}
      <Select
        id={projectId}
        label="Project to configure"
        errorMessage={errors.project}
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        options={[
          { value: '', text: 'Select a project' },
          ...projects.map((p) => ({ value: p.slug, text: p.name }))
        ]}
      />
      {fields && (
        <>
          <p className="govuk-body">Current version: {version}</p>
          {MODEL_FIELDS.map(([key, label, hint]) => (
            <TextField
              key={key}
              id={idFor(key)}
              label={label}
              hint={hint}
              error={errors[key]}
              value={fields[key]}
              onChange={setField(key)}
              width={5}
            />
          ))}
          {WEIGHT_FIELDS.map(([key, label]) => (
            <TextField
              key={key}
              id={idFor(key)}
              label={label}
              hint={
                key === 'lines'
                  ? 'The three weights must add up to 1'
                  : undefined
              }
              error={errors[key]}
              value={fields[key]}
              onChange={setField(key)}
              width={4}
            />
          ))}
          <Button type="submit">Save complexity model</Button>
        </>
      )}
    </form>
  )
}

function RecomputeComplexity({ onDone }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleRecompute = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await jsonWrite('/api/admin/complexity/recompute', 'POST')
      if (!res.ok) throw new Error('Complexity could not be recomputed')
      const { updated } = await res.json()
      onDone(`Complexity recomputed: ${updated} pull requests rescored.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && <ErrorSummary errors={[{ text: error }]} key={error} />}
      <p className="govuk-body">
        Rescores every stored pull request with its project&apos;s current
        model.
      </p>
      <Button variant="secondary" onClick={handleRecompute} disabled={busy}>
        Recompute complexity
      </Button>
    </>
  )
}

export function AdminProjectsView({ onNavigateHome }) {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading')
  const [success, setSuccess] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setProjects(await readList(await apiFetch('/api/projects'), 'projects'))
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreated = (name) => {
    setSuccess(`Project ${name} added.`)
    loadData()
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full">
        <BackLink href="#/overview" onClick={onNavigateHome}>
          Back to overview
        </BackLink>
        <h1 className="govuk-heading-xl govuk-!-margin-top-4">
          Project Management
        </h1>

        {success && (
          <NotificationBanner type="success" autoFocus key={success}>
            <p className="govuk-notification-banner__heading">{success}</p>
          </NotificationBanner>
        )}
        {status === 'error' && (
          <ErrorSummary
            errors={[
              { text: 'Projects could not be loaded. Try again later.' }
            ]}
          />
        )}

        <section
          className="govuk-!-margin-bottom-8"
          aria-labelledby="admin-projects"
        >
          <h2 className="govuk-heading-l" id="admin-projects">
            Projects
          </h2>
          <Table
            caption="Configured projects"
            captionHidden
            head={[
              { id: 'name', label: 'Name' },
              { id: 'slug', label: 'Slug' },
              { id: 'type', label: 'Type' },
              { id: 'adoption', label: 'Adoption start date' }
            ]}
            rows={projects.map((p) => ({
              id: p.slug,
              cells: [
                p.name,
                <code key="slug">{p.slug}</code>,
                <Tag
                  key="type"
                  colour={p.type === 'ai-native' ? 'purple' : 'blue'}
                >
                  {typeLabel(p.type)}
                </Tag>,
                formatDate(p.adoptionStartDate)
              ]
            }))}
          />
        </section>

        <section
          className="govuk-!-margin-bottom-8 govuk-!-width-two-thirds"
          aria-labelledby="admin-create"
        >
          <h2 className="govuk-heading-l" id="admin-create">
            Add a project
          </h2>
          <CreateProject onCreated={handleCreated} />
        </section>

        <section
          className="govuk-!-margin-bottom-8 govuk-!-width-two-thirds"
          aria-labelledby="admin-access"
        >
          <h2 className="govuk-heading-l" id="admin-access">
            Project Access
          </h2>
          <p className="govuk-body">
            Who can see a project is set by Role Mappings under Settings.
            Repository mapping and personas are managed by project admins under
            Settings.
          </p>
        </section>

        <section
          className="govuk-!-margin-bottom-8 govuk-!-width-two-thirds"
          aria-labelledby="admin-complexity"
        >
          <h2 className="govuk-heading-l" id="admin-complexity">
            Complexity model
          </h2>
          <ComplexityModel projects={projects} onSaved={setSuccess} />
          <RecomputeComplexity onDone={setSuccess} />
        </section>
      </div>
    </div>
  )
}
