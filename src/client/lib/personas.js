/**
 * Maps each contributor's GitHub handle to the delivery persona (role) they
 * play, so the dashboard can showcase Copilot's impact for every role in the
 * project — Developers, DevOps Engineers, and QA Engineers — not just at
 * repo level.
 *
 * The handle → persona mapping itself is configured on the Settings page and
 * stored in the backend (MongoDB) rather than hardcoded here, so the roster
 * can change without a code deploy. Callers fetch it (see
 * `usePersonaMappings`) and pass it through as `mappingsByHandle`.
 */
export const PERSONAS = [
  {
    id: 'developer',
    label: 'Developers',
    icon: '{ }',
    accent: 'var(--color-copilot)'
  },
  {
    id: 'devops',
    label: 'DevOps Engineers',
    icon: '⚙',
    accent: 'var(--color-info)'
  },
  { id: 'qa', label: 'QA Engineers', icon: '✔', accent: 'var(--color-success)' }
]

/** Unmapped GitHub handles default to Developers (the majority delivery role). */
export const DEFAULT_PERSONA = 'developer'

/**
 * Builds a lower-cased handle → persona id lookup from the `/api/persona-mappings`
 * response, so lookups are case-insensitive (GitHub logins are not case-sensitive).
 */
export function buildContributorPersonaMap(mappings = []) {
  const map = {}
  for (const entry of mappings) {
    if (typeof entry?.githubHandle === 'string' && entry.persona) {
      map[entry.githubHandle.toLowerCase()] = entry.persona
    }
  }
  return map
}

export function personaForContributor(handle, mappingsByHandle = {}) {
  if (typeof handle !== 'string') return DEFAULT_PERSONA
  return mappingsByHandle[handle.toLowerCase()] ?? DEFAULT_PERSONA
}

export function personaMeta(id) {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]
}
