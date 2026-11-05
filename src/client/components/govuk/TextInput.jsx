import { useId } from 'react'

import { ErrorMessage } from './ErrorMessage.jsx'
import { Hint } from './Hint.jsx'
import { cx, joinIds } from './utils.js'

/**
 * GOV.UK text input. `width` is a `govuk-input--width-*` suffix (`20`, `30`)
 * or a fluid one (`one-half`); the rest, `ref` included, goes to the `<input>`.
 */
export function TextInput({
  id,
  name,
  label,
  labelSize,
  hint,
  errorMessage,
  width,
  type = 'text',
  className,
  formGroupClassName,
  ...rest
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = errorMessage ? `${fieldId}-error` : undefined

  return (
    <div
      className={cx(
        'govuk-form-group',
        errorMessage && 'govuk-form-group--error',
        formGroupClassName
      )}
    >
      <label
        className={cx('govuk-label', labelSize && `govuk-label--${labelSize}`)}
        htmlFor={fieldId}
      >
        {label}
      </label>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {errorMessage && <ErrorMessage id={errorId}>{errorMessage}</ErrorMessage>}
      <input
        className={cx(
          'govuk-input',
          width && `govuk-input--width-${width}`,
          errorMessage && 'govuk-input--error',
          className
        )}
        id={fieldId}
        name={name ?? fieldId}
        type={type}
        aria-describedby={joinIds(hintId, errorId)}
        {...rest}
      />
    </div>
  )
}
