import { useEffect, useId, useRef } from 'react'

import { cx } from './utils.js'

/**
 * GOV.UK notification banner. The `success` type is an alert and takes focus
 * when `autoFocus` is set; the default type is a labelled region.
 */
export function NotificationBanner({
  type,
  title,
  headingLevel = 2,
  autoFocus = false,
  children,
  className
}) {
  const titleId = useId()
  const bannerRef = useRef(null)
  const isSuccess = type === 'success'
  const shouldFocus = isSuccess && autoFocus
  const Heading = `h${headingLevel}`

  useEffect(() => {
    if (shouldFocus) bannerRef.current?.focus()
  }, [shouldFocus])

  return (
    <div
      ref={bannerRef}
      className={cx(
        'govuk-notification-banner',
        isSuccess && 'govuk-notification-banner--success',
        className
      )}
      role={isSuccess ? 'alert' : 'region'}
      aria-labelledby={titleId}
      tabIndex={shouldFocus ? -1 : undefined}
    >
      <div className="govuk-notification-banner__header">
        <Heading className="govuk-notification-banner__title" id={titleId}>
          {title ?? (isSuccess ? 'Success' : 'Important')}
        </Heading>
      </div>
      <div className="govuk-notification-banner__content">
        {typeof children === 'string' ? (
          <p className="govuk-notification-banner__heading">{children}</p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
