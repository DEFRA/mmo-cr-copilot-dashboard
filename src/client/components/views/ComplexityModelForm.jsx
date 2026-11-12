import { useEffect, useId, useState } from 'react'

import { Button, ErrorSummary, Select } from '../govuk'
import { apiFetch, jsonWrite } from '../../lib/api'
import { checkedWrite } from '../../lib/api-errors'
import { PROJECT_GONE, TextField, projectOptions } from './admin-fields.jsx'

// Tolerance for the weights' floating-point sum.
const WEIGHT_SUM_EPSILON = 1e-6
const WEIGHTS_HINT = 'The three weights must add up to 1'

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

const isWholeAtLeastOne = (raw, value) =>
  /^\d+$/.test(String(raw).trim()) && value >= 1

const isUnitWeight = (raw, value) =>
  raw !== '' && Number.isFinite(value) && value >= 0 && value <= 1

/** Validates the complexity model form; returns `{ errors, model }`. */
export function validateComplexityModel(fields) {
  const errors = {}
  const model = { weights: {} }
  for (const [key, label] of MODEL_FIELDS) {
    const value = Number(fields[key])
    if (!isWholeAtLeastOne(fields[key], value)) {
      errors[key] = `${label} must be a whole number of 1 or more`
    }
    model[key] = value
  }
  for (const [key, label] of WEIGHT_FIELDS) {
    const value = Number(fields[key])
    if (!isUnitWeight(fields[key], value)) {
      errors[key] = `${label} must be a number from 0 to 1`
    }
    model.weights[key] = value
  }
  const weightsValid = WEIGHT_FIELDS.every(([key]) => !errors[key])
  const sum = WEIGHT_FIELDS.reduce((s, [key]) => s + model.weights[key], 0)
  if (weightsValid && Math.abs(sum - 1) > WEIGHT_SUM_EPSILON) {
    errors.lines = WEIGHTS_HINT
  }
  return { errors, model }
}

const modelPath = (slug) =>
  `/api/projects/${encodeURIComponent(slug)}/complexity-model`

/** Loads the selected project's complexity model into form fields. */
function useComplexityModel(slug, setErrors) {
  const [fields, setFields] = useState(null)
  const [version, setVersion] = useState(null)

  useEffect(() => {
    if (!slug) {
      setFields(null)
      return undefined
    }
    const controller = new AbortController()
    apiFetch(modelPath(slug), {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('The model could not be loaded')
        }
        return res.json()
      })
      .then((model) => {
        setFields(toFields(model))
        setVersion(model.version ?? 1)
        setErrors({})
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setErrors({ project: err.message })
        }
      })
    return () => controller.abort()
  }, [slug, setErrors])

  return { fields, setFields, version, setVersion }
}

function ModelFields({ fields, errors, idFor, setField }) {
  return (
    <>
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
          hint={key === 'lines' ? WEIGHTS_HINT : undefined}
          error={errors[key]}
          value={fields[key]}
          onChange={setField(key)}
          width={4}
        />
      ))}
    </>
  )
}

/** Edits the complexity scoring model for one project. */
export function ComplexityModel({ projects, onSaved }) {
  const baseId = useId()
  const projectId = `${baseId}-project`
  const [slug, setSlug] = useState('')
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const { fields, setFields, version, setVersion } = useComplexityModel(
    slug,
    setErrors
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    const { errors: found, model } = validateComplexityModel(fields)
    setErrors(found)
    setAttempt((a) => a + 1)
    if (Object.keys(found).length > 0) {
      return
    }
    try {
      const res = await checkedWrite(jsonWrite(modelPath(slug), 'PUT', model), {
        fallback: 'The model could not be saved',
        notFound: PROJECT_GONE
      })
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
        options={projectOptions(projects)}
      />
      {fields && (
        <>
          <p className="govuk-body">Current version: {version}</p>
          <ModelFields
            fields={fields}
            errors={errors}
            idFor={idFor}
            setField={setField}
          />
          <Button type="submit">Save complexity model</Button>
        </>
      )}
    </form>
  )
}
