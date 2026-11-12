import { useEffect, useId, useState } from 'react'

import { isPlainClick } from '../govuk/utils.js'

// GOV.UK Frontend's tablet breakpoint, where the menu toggle is hidden.
const TABLET_UP = '(min-width: 40.0625em)'

function useMatchMedia(query) {
  const [matches, setMatches] = useState(
    () => window.matchMedia?.(query).matches ?? true
  )

  useEffect(() => {
    const list = window.matchMedia?.(query)
    if (!list) {
      return undefined
    }

    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * GOV.UK service navigation (inverse). The mobile menu toggle is driven by
 * React rather than GOV.UK Frontend's JavaScript, which would mutate React's DOM.
 */
export function ServiceNavigation({
  serviceName,
  serviceHref,
  items,
  activeId,
  onNavigate
}) {
  const menuId = useId()
  const isWide = useMatchMedia(TABLET_UP)
  const [isOpen, setIsOpen] = useState(false)
  const collapsible = items.length > 1
  const menuHidden = collapsible && !isWide && !isOpen

  return (
    <section
      aria-label="Service information"
      className="govuk-service-navigation"
    >
      <div className="govuk-width-container">
        <div className="govuk-service-navigation__container">
          {serviceName && (
            <span className="govuk-service-navigation__service-name">
              <a href={serviceHref} className="govuk-service-navigation__link">
                {serviceName}
              </a>
            </span>
          )}
          <nav aria-label="Menu" className="govuk-service-navigation__wrapper">
            {collapsible && (
              <button
                type="button"
                className="govuk-service-navigation__toggle"
                aria-controls={menuId}
                aria-expanded={isWide ? undefined : isOpen}
                hidden={isWide}
                onClick={() => setIsOpen((open) => !open)}
              >
                Menu
              </button>
            )}
            <ul
              className="govuk-service-navigation__list"
              id={menuId}
              hidden={menuHidden}
            >
              {items.map((item) => {
                const isActive = item.id === activeId
                return (
                  <li
                    key={item.id}
                    className={`govuk-service-navigation__item${isActive ? ' govuk-service-navigation__item--active' : ''}`}
                  >
                    <a
                      className="govuk-service-navigation__link"
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={(event) => {
                        if (!onNavigate || !isPlainClick(event)) {
                          return
                        }
                        event.preventDefault()
                        onNavigate(item.id)
                      }}
                    >
                      {isActive ? (
                        <strong className="govuk-service-navigation__active-fallback">
                          {item.label}
                        </strong>
                      ) : (
                        item.label
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </div>
    </section>
  )
}
