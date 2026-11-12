/** The project's active Jira project key: the first of `jira.projectKeys`, or null. */
export function jiraKeyOf(project) {
  const key = project?.jira?.projectKeys?.[0]
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null
}

export const JIRA_KEY_ADD_HINT =
  'Jira metrics use issues from this Jira project, for example MMOCR.'
export const JIRA_KEY_CHANGE_HINT =
  'Jira metrics switch to issues in the new Jira project. Pull requests that only mention the old key show no Jira data.'

/** How a project's Jira key may be edited: added when it has none, otherwise changed (backend ADR 0013). */
export function jiraKeyEdit(project) {
  const key = jiraKeyOf(project)
  return key
    ? { mode: 'change', key, hint: JIRA_KEY_CHANGE_HINT }
    : { mode: 'add', key: null, hint: JIRA_KEY_ADD_HINT }
}

/**
 * Whether the project has a Jira project key. Every Jira-derived metric,
 * column and link is shown only when this is true.
 */
export const hasJira = (project) => jiraKeyOf(project) !== null
