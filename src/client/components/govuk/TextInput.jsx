import { useId } from 'react'

import {
  FieldLabel,
  FieldMessages,
  describedByIds,
  formGroupClass
} from './FieldParts.jsx'
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
  const { hintId, errorId } = describedByIds(fieldId, hint, errorMessage)

  return (
    <div className={formGroupClass(errorMessage, formGroupClassName)}>
      <FieldLabel fieldId={fieldId} size={labelSize}>
        {label}
      </FieldLabel>
      <FieldMessages
        hint={hint}
        hintId={hintId}
        errorMessage={errorMessage}
        errorId={errorId}
      />
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
