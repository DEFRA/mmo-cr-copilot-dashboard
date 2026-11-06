import { cx } from './utils.js'

export function Fieldset({
  legend,
  legendSize,
  describedBy,
  role,
  children,
  className
}) {
  return (
    <fieldset
      className={cx('govuk-fieldset', className)}
      role={role}
      aria-describedby={describedBy}
    >
      <legend
        className={cx(
          'govuk-fieldset__legend',
          legendSize && `govuk-fieldset__legend--${legendSize}`
        )}
      >
        {legend}
      </legend>
      {children}
    </fieldset>
  )
}
