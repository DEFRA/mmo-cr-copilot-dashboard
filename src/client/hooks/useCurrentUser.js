import { useEffect, useMemo, useState } from 'react'

const ADMIN_ROLE = 'Dashboard.Admin'
const PROJECT_ROLES = new Set(['project-admin', 'project-user'])

const strings = (value) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []

/** Keeps only well-formed fields; anything unexpected is dropped, not trusted. */
export function normaliseUser(body) {
  if (!body || typeof body !== 'object' || body.authenticated === false) {
    return null
  }
  const projectRoles = Object.fromEntries(
    Object.entries(
      body.projectRoles && typeof body.projectRoles === 'object'
        ? body.projectRoles
        : {}
    ).filter(([, role]) => PROJECT_ROLES.has(role))
  )
  return {
    oid: typeof body.oid === 'string' ? body.oid : undefined,
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : undefined,
    roles: strings(body.roles),
    projectRoles,
    allowedProjects: strings(body.allowedProjects)
  }
}

/**
 * The signed-in user from the BFF session; anonymous on any failure. This is
 * a plain fetch because `/api/me` answers anonymous callers itself and must
 * never trigger the sign-in redirect.
 */
export function useCurrentUser() {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/me', {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        setUser(normaliseUser(body))
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setUser(null)
        setStatus('ready')
      })

    return () => controller.abort()
  }, [])

  return useMemo(() => {
    const roles = user?.roles ?? []
    const projectRoles = user?.projectRoles ?? {}
    const isAdmin = roles.includes(ADMIN_ROLE)
    return {
      user,
      status,
      roles,
      projectRoles,
      allowedProjects: user?.allowedProjects ?? [],
      isAdmin,
      roleFor: (slug) => projectRoles[slug] ?? null,
      canAdministerProject: (slug) =>
        isAdmin || projectRoles[slug] === 'project-admin'
    }
  }, [user, status])
}
