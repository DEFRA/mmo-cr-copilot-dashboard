export const SLUG_PATTERN = /^[A-Z][A-Z0-9]{2,3}$/
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+$/
export const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/
export const SONAR_KEY_PATTERN = /^[\w.:-]+$/

export const EMPTY_DETAILS = {
  name: '',
  slug: '',
  type: '',
  adoption: { day: '', month: '', year: '' },
  jiraKeys: ''
}

export const EMPTY_REPOSITORIES = [{ fullName: '', sonarProjectKey: '' }]

export const splitKeys = (value) =>
  value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)

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

export const isRepositoryName = (value) =>
  typeof value === 'string' && REPOSITORY_PATTERN.test(value)

export const typeLabel = (type) =>
  type === 'ai-native' ? 'AI-native' : 'AI-adopted'

export const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : 'Not set'

/** Field errors for the project details step, keyed by field. */
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

  if (splitKeys(form.jiraKeys).some((key) => !JIRA_KEY_PATTERN.test(key))) {
    errors.jiraKeys =
      'Jira project keys must be capital letters, numbers or underscores, separated by commas, like MMOCR, FES'
  }
  return errors
}

/**
 * Errors for the repositories step: `list` for the whole step and `rows` for
 * the rows at fault. An empty object means valid. Rows with no repository
 * name are ignored, so a spare blank row never blocks the step.
 */
export function validateRepositories(rows, mapped = []) {
  const taken = new Set(mapped.map((name) => name.toLowerCase()))
  const seen = new Set()
  const rowErrors = {}
  let filled = 0

  rows.forEach((row, index) => {
    const fullName = row.fullName.trim()
    const sonarKey = row.sonarProjectKey.trim()
    const found = {}
    if (fullName) {
      filled += 1
      const key = fullName.toLowerCase()
      if (!REPOSITORY_PATTERN.test(fullName)) {
        found.fullName =
          'Enter the repository as owner/name, like DEFRA/mmo-cr-pdf'
      } else if (taken.has(key)) {
        found.fullName = `${fullName} is already mapped to a project`
      } else if (seen.has(key)) {
        found.fullName = `${fullName} is listed more than once`
      }
      seen.add(key)
    } else if (sonarKey) {
      found.fullName = 'Enter the repository this Sonar project key is for'
    }
    if (sonarKey && !SONAR_KEY_PATTERN.test(sonarKey)) {
      found.sonarProjectKey =
        'Sonar project key must only include letters, numbers, hyphens, underscores, dots and colons'
    }
    if (Object.keys(found).length > 0) rowErrors[index] = found
  })

  const errors = {}
  if (filled === 0) errors.list = 'Add at least one repository'
  if (Object.keys(rowErrors).length > 0) errors.rows = rowErrors
  return errors
}

/** The body for creating the project from the details step. */
export function toProjectRequest(form) {
  const date = parseDate(form.adoption)
  return {
    name: form.name.trim(),
    slug: form.slug,
    type: form.type,
    ...(date && { adoptionStartDate: date.toISOString() }),
    jira: { projectKeys: splitKeys(form.jiraKeys) }
  }
}

/** One `{ fullName, body }` per named repository, ready to PUT. */
export function toRepositoryMappings(projectSlug, rows) {
  return rows
    .map((row) => ({
      fullName: row.fullName.trim(),
      sonarProjectKey: row.sonarProjectKey.trim()
    }))
    .filter((row) => row.fullName)
    .map(({ fullName, sonarProjectKey }) => ({
      fullName,
      body: { projectSlug, ...(sonarProjectKey && { sonarProjectKey }) }
    }))
}
