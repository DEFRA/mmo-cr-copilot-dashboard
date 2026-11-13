// A subset of the backend's /^[A-Z][A-Z0-9]{2,3}$/.
export const SLUG_PATTERN = /^[A-Z]{3,4}$/
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+$/
export const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/

export const EMPTY_DETAILS = {
  name: '',
  slug: '',
  type: '',
  adoption: { day: '', month: '', year: '' },
  jiraKey: ''
}

const jiraKeyOf = (form) => form.jiraKey.trim().toUpperCase()

/** An AI-Native project needs its Jira key; an AI-Adopted one may go without. */
export const jiraKeyRequired = (type) => type === 'ai-native'

/** The label and hint for the Jira key field, which follow the project type. */
export const jiraKeyField = (type) => {
  const hint = 'The one Jira project for this project, like MMOCR.'
  return jiraKeyRequired(type)
    ? {
        label: 'Jira project key',
        hint: `${hint} Required for an AI-Native project.`
      }
    : { label: 'Jira project key (optional)', hint }
}

/** A real calendar date from day, month and year strings, or null. */
export function parseDate({ day, month, year }) {
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

/** Day, month and year strings for a date input, from an ISO date. */
export function toDateParts(iso) {
  if (!iso) {
    return { day: '', month: '', year: '' }
  }
  const date = new Date(iso)
  return {
    day: String(date.getUTCDate()),
    month: String(date.getUTCMonth() + 1),
    year: String(date.getUTCFullYear())
  }
}

/** What is wrong with an adoption date input, or null. */
export function adoptionDateError(adoption, required, now = new Date()) {
  const { day, month, year } = adoption
  if (!day && !month && !year) {
    return required ? 'Enter the date the team adopted Copilot' : null
  }
  const date = parseDate(adoption)
  if (!date) {
    return 'Adoption start date must be a real date'
  }
  if (date > now) {
    return 'Adoption start date must be today or in the past'
  }
  return null
}

export const isRepositoryName = (value) =>
  typeof value === 'string' && REPOSITORY_PATTERN.test(value)

export const typeLabel = (type) =>
  type === 'ai-native' ? 'AI-Native' : 'AI-Adopted'

export const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : 'Not set'

/** What is wrong with an upper-cased, trimmed Jira key, or null. */
export function jiraKeyError(jiraKey, required = false) {
  if (/[,\s]/.test(jiraKey)) {
    return 'Enter one Jira project key, with no commas or spaces, like MMOCR'
  }
  if (!jiraKey && required) {
    return 'Enter a Jira project key'
  }
  if (jiraKey && !JIRA_KEY_PATTERN.test(jiraKey)) {
    return 'Jira project key must start with a letter and only contain letters, numbers or underscores'
  }
  return null
}

const MAX_PROJECT_NAME_LENGTH = 80

function projectNameError(name) {
  if (!name) {
    return 'Enter a project name'
  }
  return name.length > MAX_PROJECT_NAME_LENGTH
    ? `Project name must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer`
    : null
}

function slugError(slug) {
  if (!slug) {
    return 'Enter a project slug'
  }
  if (!/^[A-Z]+$/.test(slug)) {
    return 'Slug must only contain letters, no numbers'
  }
  return SLUG_PATTERN.test(slug) ? null : 'Slug must be 3 to 4 letters'
}

/** Field errors for the project details step, keyed by field. */
export function validateProject(form, now = new Date()) {
  const errors = {}
  const nameProblem = projectNameError(form.name.trim())
  if (nameProblem) {
    errors.name = nameProblem
  }
  const slugProblem = slugError(form.slug.toUpperCase())
  if (slugProblem) {
    errors.slug = slugProblem
  }

  if (!form.type) {
    errors.type = 'Select the project type'
  }

  const adoptionError = adoptionDateError(
    form.adoption,
    form.type === 'ai-adopted',
    now
  )
  if (adoptionError) {
    errors.adoption = adoptionError
  }

  const jiraError = jiraKeyError(jiraKeyOf(form), jiraKeyRequired(form.type))
  if (jiraError) {
    errors.jiraKey = jiraError
  }
  return errors
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase()

/**
 * Add a typed or chosen repository to the list. `error` says why it was
 * refused; a name already in the list (any case) leaves it unchanged and
 * is flagged `duplicate`.
 */
export function addRepository(list, value, mapped = []) {
  const name = value.trim()
  if (!isRepositoryName(name)) {
    return {
      list,
      name,
      error: 'Enter the repository as owner/name, like DEFRA/mmo-cr-pdf'
    }
  }
  if (mapped.some((taken) => sameName(taken, name))) {
    return { list, name, error: `${name} is already mapped to a project` }
  }
  if (list.some((added) => sameName(added, name))) {
    return { list, name, duplicate: true }
  }
  return { list: [...list, name], name }
}

/** `{ list }` says what is wrong with the added repositories; `{}` is valid. */
export function validateRepositories(names, mapped = []) {
  if (names.length === 0) {
    return { list: 'Add at least one repository' }
  }
  const taken = names.find((name) => mapped.some((m) => sameName(m, name)))
  return taken ? { list: `${taken} is already mapped to a project` } : {}
}

/** The body for creating the project from the details step. */
export function toProjectRequest(form) {
  const date = parseDate(form.adoption)
  const jiraKey = jiraKeyOf(form)
  return {
    name: form.name.trim(),
    slug: form.slug.toUpperCase(),
    type: form.type,
    ...(date && { adoptionStartDate: date.toISOString() }),
    jira: { projectKeys: jiraKey ? [jiraKey] : [] }
  }
}

/** One `{ fullName, body }` per repository name, ready to PUT. */
export function toRepositoryMappings(projectSlug, names) {
  return names.map((fullName) => ({ fullName, body: { projectSlug } }))
}
