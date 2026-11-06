import { cx } from './utils.js'

/** GOV.UK details, built on native `<details>` so it needs no JavaScript. */
export function Details({ summary, children, open, className, ...rest }) {
  return (
    <details
      className={cx('govuk-details', className)}
      open={open || undefined}
      {...rest}
    >
      <summary className="govuk-details__summary">
        <span className="govuk-details__summary-text">{summary}</span>
      </summary>
      <div className="govuk-details__text">{children}</div>
    </details>
  )
}
