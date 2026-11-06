import { useEffect, useRef } from 'react'

import { cx } from './utils.js'

function focusTarget(event, href) {
  const target = href?.startsWith('#')
    ? document.getElementById(href.slice(1))
    : null
  if (!target) return

  event.preventDefault()
  target.focus()
}

/**
 * GOV.UK error summary. Takes focus on mount; each error is `{ href, text }`
 * and its link moves focus to the field with that id.
 */
export function ErrorSummary({
  title = 'There is a problem',
  description,
  errors = [],
  autoFocus = true,
  className
}) {
  const summaryRef = useRef(null)

  useEffect(() => {
    if (autoFocus) summaryRef.current?.focus()
  }, [autoFocus])

  return (
    <div
      ref={summaryRef}
      className={cx('govuk-error-summary', className)}
      tabIndex={-1}
    >
      <div role="alert">
        <h2 className="govuk-error-summary__title">{title}</h2>
        <div className="govuk-error-summary__body">
          {description && <p>{description}</p>}
          {errors.length > 0 && (
            <ul className="govuk-list govuk-error-summary__list">
              {errors.map((error) => (
                <li key={error.href ?? error.text}>
                  {error.href ? (
                    <a
                      href={error.href}
                      onClick={(event) => focusTarget(event, error.href)}
                    >
                      {error.text}
                    </a>
                  ) : (
                    error.text
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
