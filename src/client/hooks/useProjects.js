import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

/**
 * The projects the signed-in user holds a role on, as filtered by the backend.
 * There is no fallback project: an empty list means no access (deny by default).
 */
export function useProjects() {
  const [projects, setProjects] = useState([])
  const [activeSlug, setActiveSlug] = useState(() => {
    try {
      return localStorage.getItem('mmo-active-project') || null
    } catch {
      return null
    }
  })
  const [status, setStatus] = useState('loading')

  const fetchProjects = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects', {
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : data?.projects
      setProjects(Array.isArray(list) ? list : [])
      setStatus('success')
    } catch {
      setStatus((current) => (current === 'success' ? current : 'error'))
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const selectProject = useCallback((slug) => {
    setActiveSlug(slug)
    try {
      localStorage.setItem('mmo-active-project', slug)
    } catch {
      // Ignore storage errors
    }
  }, [])

  const activeProject =
    projects.find((p) => p.slug === activeSlug) || projects[0] || null

  return {
    projects,
    activeProject,
    selectProject,
    status,
    loading: status === 'loading',
    refresh: fetchProjects
  }
}
