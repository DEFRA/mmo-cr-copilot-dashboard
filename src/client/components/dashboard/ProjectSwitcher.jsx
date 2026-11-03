import { useEffect, useId, useRef, useState } from 'react'
import { cx } from '../govuk/utils.js'
import { Icon } from './Icon.jsx'

export function ProjectSwitcher({
  projects = [],
  activeProject = {},
  onSelectProject,
  onManageProjects
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const toggleRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        toggleRef.current?.focus()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const isNative = activeProject?.type === 'ai-native'

  return (
    <div className="app-switcher-wrap" ref={containerRef}>
      <button
        ref={toggleRef}
        type="button"
        className="app-switcher"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span
          className={cx(
            'app-switcher__type',
            isNative && 'app-switcher__type--native'
          )}
        >
          {isNative ? 'AI-native' : 'AI-adopted'}
        </span>{' '}
        <span>
          <span className="app-switcher__label">Project:</span>{' '}
          {activeProject?.name || 'Select project'}
        </span>
        <Icon name="chevron" size={18} />
      </button>
      {isOpen && (
        <ul
          id={menuId}
          role="listbox"
          aria-label="Projects"
          className="app-switcher__menu"
        >
          {projects.map((proj) => (
            <li key={proj.slug} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={proj.slug === activeProject?.slug}
                className="app-switcher__option"
                onClick={() => {
                  onSelectProject?.(proj.slug)
                  setIsOpen(false)
                }}
              >
                <span>{proj.name}</span>
                <span
                  className={cx(
                    'app-switcher__type',
                    proj.type === 'ai-native' && 'app-switcher__type--native'
                  )}
                >
                  {proj.type === 'ai-native' ? 'AI-native' : 'AI-adopted'}
                </span>
              </button>
            </li>
          ))}
          {onManageProjects && (
            <li className="app-switcher__manage" role="presentation">
              <a
                className="govuk-link"
                href="#/admin/projects"
                onClick={() => {
                  onManageProjects()
                  setIsOpen(false)
                }}
              >
                Manage projects
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
