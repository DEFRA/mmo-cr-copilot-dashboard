import { useCallback, useEffect, useId, useState } from 'react'

import {
  BackLink,
  Button,
  DateInput,
  ErrorSummary,
  NotificationBanner,
  Select,
  Table,
  Tag,
  TextInput
} from '../govuk'
import { cx, isPlainClick } from '../govuk/utils.js'
import { apiFetch, jsonWrite } from '../../lib/api'
import { checkedWrite, toApiError } from '../../lib/api-errors'
import { jiraKeyEdit } from '../../lib/jira'
import {
  adoptionDateError,
  formatDate,
  jiraKeyError,
  parseDate,
  toDateParts,
  typeLabel
} from '../../lib/onboarding'
import { toHash } from '../../lib/routes'

export { validateProject } from '../../lib/onboarding'

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
      const res = await checkedWrite(
        jsonWrite(
          `/api/projects/${encodeURIComponent(slug)}/complexity-model`,
          'PUT',
          model
        ),
        {
          fallback: 'The model could not be saved',
          notFound: 'That project no longer exists'
        }
      )
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

const JIRA_KEY_FAILED = 'The Jira project key could not be saved'

// A stored key is read-only; a key-less AI-Adopted project may add one once.
function ProjectJiraKey({ projects, onSaved }) {
  const baseId = useId()
  const projectId = `${baseId}-project`
  const keyId = `${baseId}-key`
  const [slug, setSlug] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)

  const project = projects.find((p) => p.slug === slug)
  const edit = project ? jiraKeyEdit(project) : null

  const handleProject = (event) => {
    setSlug(event.target.value)
    setValue('')
    setError(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const key = value.trim().toUpperCase()
    const problem = jiraKeyError(key, true)
    setAttempt((a) => a + 1)
    if (problem) {
      setError({ field: true, text: problem })
      return
    }
    setSaving(true)
    setError(null)
    try {
      await checkedWrite(
        jsonWrite(`/api/projects/${encodeURIComponent(slug)}`, 'PUT', {
          jira: { projectKeys: [key] }
        }),
        {
          context: 'project',
          fallback: JIRA_KEY_FAILED,
          notFound: 'That project no longer exists'
        }
      )
      setValue('')
      onSaved(`Jira project key ${key} added to ${project.name}.`)
    } catch (err) {
      const { field, message } = toApiError(err, JIRA_KEY_FAILED)
      setError({ field: field === 'jiraKey', text: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <ErrorSummary
          key={attempt}
          errors={[
            { href: error.field ? `#${keyId}` : undefined, text: error.text }
          ]}
        />
      )}
      <Select
        id={projectId}
        label="Project to change"
        value={slug}
        onChange={handleProject}
        options={[
          { value: '', text: 'Select a project' },
          ...projects.map((p) => ({ value: p.slug, text: p.name }))
        ]}
      />
      {edit?.mode === 'fixed' && (
        <>
          <h3 className="govuk-heading-s">Jira project key</h3>
          <p className="govuk-body govuk-!-margin-bottom-1">
            {edit.key ?? 'None'}
          </p>
          <p className="govuk-hint">{edit.hint}</p>
        </>
      )}
      {edit?.mode === 'add' && (
        <>
          <TextInput
            id={keyId}
            label="Jira project key"
            labelSize="s"
            hint={edit.hint}
            errorMessage={error?.field ? error.text : undefined}
            autoCapitalize="characters"
            spellCheck={false}
            autoComplete="off"
            width="10"
            value={value}
            onChange={(event) => setValue(event.target.value.toUpperCase())}
          />
          <Button type="submit" disabled={saving}>
            Add Jira project key
          </Button>
        </>
      )}
    </form>
  )
}

const ADOPTION_FAILED = 'The adoption start date could not be saved'

// AI-Native projects have no adoption date, so only AI-Adopted ones are offered.
function AdoptionStartDate({ projects, onSaved }) {
  const baseId = useId()
  const projectId = `${baseId}-project`
  const dateId = `${baseId}-date`
  const [slug, setSlug] = useState('')
  const [adoption, setAdoption] = useState(toDateParts())
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)

  const adopted = projects.filter((p) => p.type !== 'ai-native')
  const project = adopted.find((p) => p.slug === slug)

  const handleProject = (event) => {
    const next = event.target.value
    setSlug(next)
    setAdoption(
      toDateParts(adopted.find((p) => p.slug === next)?.adoptionStartDate)
    )
    setError(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    setAttempt((a) => a + 1)
    const problem = adoptionDateError(adoption, true)
    if (problem) {
      setError({ field: true, text: problem })
      return
    }
    const adoptionStartDate = parseDate(adoption).toISOString()
    setSaving(true)
    setError(null)
    try {
      await checkedWrite(
        jsonWrite(`/api/projects/${encodeURIComponent(slug)}`, 'PUT', {
          adoptionStartDate
        }),
        {
          context: 'project',
          fallback: ADOPTION_FAILED,
          notFound: 'That project no longer exists'
        }
      )
      onSaved(
        `Adoption start date for ${project.name} changed to ${formatDate(adoptionStartDate)}.`
      )
    } catch (err) {
      setError({ field: false, text: toApiError(err, ADOPTION_FAILED).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <ErrorSummary
          key={attempt}
          errors={[
            {
              href: error.field ? `#${dateId}-day` : undefined,
              text: error.text
            }
          ]}
        />
      )}
      <Select
        id={projectId}
        label="Project to change"
        value={slug}
        onChange={handleProject}
        options={[
          { value: '', text: 'Select a project' },
          ...adopted.map((p) => ({ value: p.slug, text: p.name }))
        ]}
      />
      {project && (
        <>
          <DateInput
            id={dateId}
            legend="Adoption start date"
            legendSize="s"
            hint="The date the team started using Copilot. For example, 1 6 2026."
            errorMessage={error?.field ? error.text : undefined}
            value={adoption}
            onChange={setAdoption}
          />
          <Button type="submit" disabled={saving}>
            Save adoption date
          </Button>
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
      const res = await checkedWrite(
        jsonWrite('/api/admin/complexity/recompute', 'POST'),
        { fallback: 'Complexity could not be recomputed' }
      )
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

export function AdminProjectsView({
  onNavigateHome,
  onOnboardProject,
  onProjectsChanged
}) {
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
          <div className="govuk-!-width-two-thirds">
            <h3 className="govuk-heading-m">Change Adoption Start Date</h3>
            <AdoptionStartDate
              projects={projects}
              onSaved={(message) => {
                setSuccess(message)
                loadData()
                onProjectsChanged?.()
              }}
            />
          </div>
        </section>

        <section
          className="govuk-!-margin-bottom-8 govuk-!-width-two-thirds"
          aria-labelledby="admin-create"
        >
          <h2 className="govuk-heading-l" id="admin-create">
            Add a Project
          </h2>
          <p className="govuk-body">
            Projects are added in steps: the project&apos;s details, then the
            repositories that feed it.
          </p>
          <Button
            href={toHash({ level: 'onboarding' })}
            onClick={(event) => {
              if (!onOnboardProject || !isPlainClick(event)) return
              event.preventDefault()
              onOnboardProject()
            }}
          >
            Onboard a project
          </Button>
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
          aria-labelledby="admin-jira"
        >
          <h2 className="govuk-heading-l" id="admin-jira">
            Jira Project Key
          </h2>
          <ProjectJiraKey
            projects={projects}
            onSaved={(message) => {
              setSuccess(message)
              loadData()
              onProjectsChanged?.()
            }}
          />
        </section>

        <section
          className="govuk-!-margin-bottom-8 govuk-!-width-two-thirds"
          aria-labelledby="admin-complexity"
        >
          <h2 className="govuk-heading-l" id="admin-complexity">
            Complexity Model
          </h2>
          <ComplexityModel projects={projects} onSaved={setSuccess} />
          <RecomputeComplexity onDone={setSuccess} />
        </section>
      </div>
    </div>
  )
}
