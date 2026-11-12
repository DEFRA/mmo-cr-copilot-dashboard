import { ErrorMessage } from './ErrorMessage.jsx'
import { Hint } from './Hint.jsx'
import { cx } from './utils.js'

/** `govuk-form-group`, marked as in error when there is a message. */
export const formGroupClass = (errorMessage, extra) =>
  cx('govuk-form-group', errorMessage && 'govuk-form-group--error', extra)

/** Ids for the hint and error message, present only when each is shown. */
export const describedByIds = (fieldId, hint, errorMessage) => ({
  hintId: hint ? `${fieldId}-hint` : undefined,
  errorId: errorMessage ? `${fieldId}-error` : undefined
})

export function FieldLabel({ fieldId, labelId, size, children }) {
  return (
    <label
      className={cx('govuk-label', size && `govuk-label--${size}`)}
      htmlFor={fieldId}
      id={labelId}
    >
      {children}
    </label>
  )
}

/** The hint and error message under a GOV.UK label, each only when set. */
export function FieldMessages({ hint, hintId, errorMessage, errorId }) {
  return (
    <>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {errorMessage && <ErrorMessage id={errorId}>{errorMessage}</ErrorMessage>}
    </>
  )
}
