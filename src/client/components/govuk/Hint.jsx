import { cx } from './utils.js'

export function Hint({ id, children, className }) {
  return (
    <div id={id} className={cx('govuk-hint', className)}>
      {children}
    </div>
  )
}
