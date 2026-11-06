export const VALIDATION_FAILED =
  'Some of the information was not accepted. Check your answers and try again.'
export const FORBIDDEN = 'You do not have permission to do this'
export const NOT_FOUND = 'That item no longer exists'
export const CONFLICT =
  'Someone else changed this at the same time. Reload the page and try again.'
export const UNAVAILABLE = 'Something went wrong. Try again later.'
export const NO_JIRA_KEY = 'This project has no Jira project key'
export const SLUG_TAKEN =
  'That project slug is already in use. Choose a different slug.'
export const SONAR_KEY_TAKEN = 'That SonarCloud project key is already in use.'

// Joi failures from the backend and from Hapi's own validation in the BFF.
const GENERIC_VALIDATION = new Set([
  'Invalid request input',
  'Invalid request payload input',
  'Invalid request params input',
  'Invalid request query input'
])

// Matched on context, status and exact message; without `text` the backend wording is shown.
const KNOWN_ERRORS = [
  {
    context: 'project',
    status: 409,
    message: 'That project slug is already in use',
    field: 'slug',
    text: SLUG_TAKEN
  },
  {
    context: 'project',
    status: 400,
    message: 'AI-Native projects require exactly one Jira project key',
    field: 'jiraKey'
  },
  {
    context: 'project',
    status: 400,
    message: 'The Jira project key cannot be changed',
    field: 'jiraKey'
  },
  {
    context: 'sonarKey',
    status: 409,
    message: 'That SonarCloud project key is already in use',
    field: 'sonarProjectKey',
    text: SONAR_KEY_TAKEN
  },
  {
    context: 'jiraWorkflow',
    status: 422,
    message: 'Project has no Jira project key',
    text: NO_JIRA_KEY
  }
]

/** A failed API call: `status` is 0 when the request never got a response. */
export class ApiError extends Error {
  constructor({ status, message, field = null }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
  }
}

async function bodyMessage(res) {
  try {
    const body = await res.json()
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    return message || null
  } catch {
    return null
  }
}

function byStatus(status, { fallback, notFound }) {
  if (status === 400 || status === 422) return VALIDATION_FAILED
  if (status === 403) return FORBIDDEN
  if (status === 404) return notFound ?? NOT_FOUND
  if (status === 409) return CONFLICT
  return fallback ?? UNAVAILABLE
}

// A 4xx body message is shown unless generic; a 5xx body never is.
export async function readApiError(res, options = {}) {
  const { status } = res
  const message = await bodyMessage(res)
  const known = KNOWN_ERRORS.find(
    (entry) =>
      entry.context === options.context &&
      entry.status === status &&
      entry.message === message
  )
  if (known) {
    return new ApiError({
      status,
      message: known.text ?? message,
      field: known.field
    })
  }
  const usable =
    message &&
    status >= 400 &&
    status < 500 &&
    ![403, 404].includes(status) &&
    !GENERIC_VALIDATION.has(message)
  return new ApiError({
    status,
    message: usable ? message : byStatus(status, options)
  })
}

/** An `ApiError` for anything thrown, using `fallback` when no response arrived. */
export function toApiError(error, fallback = UNAVAILABLE) {
  return error instanceof ApiError
    ? error
    : new ApiError({ status: 0, message: fallback })
}

/** Throws the `readApiError` result for a failed response; returns it otherwise. */
export async function ensureOk(res, options) {
  if (!res.ok) throw await readApiError(res, options)
  return res
}

/** Awaits a request, throwing an `ApiError` if it fails or never gets a response. */
export async function checkedWrite(request, options = {}) {
  let res
  try {
    res = await request
  } catch (error) {
    throw toApiError(error, options.fallback)
  }
  return ensureOk(res, options)
}
