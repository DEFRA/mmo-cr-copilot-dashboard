import { cx } from './utils.js'

/** GOV.UK tag. The text always carries the meaning; colour only reinforces it. */
export function Tag({ children, colour, className }) {
  return (
    <strong
      className={cx('govuk-tag', colour && `govuk-tag--${colour}`, className)}
    >
      {children}
    </strong>
  )
}
