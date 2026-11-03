import { cx } from './utils.js'

export function BackLink({
  href = '#',
  children = 'Back',
  className,
  ...rest
}) {
  return (
    <a href={href} className={cx('govuk-back-link', className)} {...rest}>
      {children}
    </a>
  )
}
