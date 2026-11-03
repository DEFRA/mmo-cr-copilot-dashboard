import { cx } from './utils.js'

export function InsetText({ children, className }) {
  return <div className={cx('govuk-inset-text', className)}>{children}</div>
}
