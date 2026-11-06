import { useId } from 'react'

import { ErrorMessage } from './ErrorMessage.jsx'
import { Hint } from './Hint.jsx'
import { cx, joinIds } from './utils.js'

/**
 * GOV.UK select. `options` is `[{ value, text, disabled }]`; `value`,
 * `defaultValue` and `onChange` pass straight to the `<select>`.
 */
export function Select({
  id,
  name,
  label,
  hint,
  errorMessage,
  options,
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
      <label className="govuk-label" htmlFor={fieldId}>
        {label}
      </label>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {errorMessage && <ErrorMessage id={errorId}>{errorMessage}</ErrorMessage>}
      <select
        className={cx(
          'govuk-select',
          errorMessage && 'govuk-select--error',
          className
        )}
        id={fieldId}
        name={name ?? fieldId}
        aria-describedby={joinIds(hintId, errorId)}
        {...rest}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.text}
          </option>
        ))}
      </select>
    </div>
  )
}
