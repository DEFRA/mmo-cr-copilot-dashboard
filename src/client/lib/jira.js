/** The project's active Jira project key: the first of `jira.projectKeys`, or null. */
export function jiraKeyOf(project) {
  const key = project?.jira?.projectKeys?.[0]
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null
}

export const JIRA_KEY_FIXED = 'The Jira project key cannot be changed.'
export const JIRA_KEY_ADD_ONCE =
  'You can add a Jira project key once. It cannot be changed afterwards.'

/**
 * How a project's Jira key may be edited. A stored key is fixed for good, an
 * AI-Native project's key is never edited here, and a key-less AI-Adopted
 * project may add one once.
 */
export function jiraKeyEdit(project) {
  const key = jiraKeyOf(project)
  if (key || project?.type === 'ai-native') {
    return { mode: 'fixed', key, hint: JIRA_KEY_FIXED }
  }
  return { mode: 'add', key: null, hint: JIRA_KEY_ADD_ONCE }
}

/**
 * Whether the project has a Jira project key. Every Jira-derived metric,
 * column and link is shown only when this is true.
 */
export const hasJira = (project) => jiraKeyOf(project) !== null
