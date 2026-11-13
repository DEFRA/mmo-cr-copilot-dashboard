import { cx } from './utils.js'

/** GOV.UK button. Renders a link styled as a button when given `href`. */
export function Button({
  children,
  variant,
  href,
  type = 'button',
  disabled,
  className,
  onKeyDown,
  ...rest
}) {
  const classes = cx(
    'govuk-button',
    variant && `govuk-button--${variant}`,
    className
  )

  if (href) {
    // GOV.UK Frontend's JavaScript lets Space activate a link button.
    const handleKeyDown = (event) => {
      onKeyDown?.(event)
      if (event.key === ' ') {
        event.preventDefault()
        event.currentTarget.click()
      }
    }

    return (
      <a // NOSONAR: GOV.UK Frontend's link-button pattern; Space is handled above
        href={href}
        role="button"
        draggable="false"
        className={classes}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {children}
      </a>
    )
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {children}
    </button>
  )
}
