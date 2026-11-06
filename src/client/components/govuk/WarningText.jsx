import { cx } from './utils.js'

export function WarningText({
  children,
  iconFallbackText = 'Warning',
  className
}) {
  return (
    <div className={cx('govuk-warning-text', className)}>
      <span className="govuk-warning-text__icon" aria-hidden="true">
        !
      </span>
      <strong className="govuk-warning-text__text">
        <span className="govuk-visually-hidden">{iconFallbackText}</span>
        {children}
      </strong>
    </div>
  )
}
