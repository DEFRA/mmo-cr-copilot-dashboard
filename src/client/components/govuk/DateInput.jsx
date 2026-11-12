import { useId, useState } from 'react'

import { ErrorMessage } from './ErrorMessage.jsx'
import { Fieldset } from './Fieldset.jsx'
import { Hint } from './Hint.jsx'
import { cx, joinIds } from './utils.js'

const FIELDS = [
  { key: 'day', label: 'Day', width: 2 },
  { key: 'month', label: 'Month', width: 2 },
  { key: 'year', label: 'Year', width: 4 }
]

/**
 * GOV.UK date input. `value` is `{ day, month, year }`; `onChange` receives the
 * whole next value. `errorFields` limits the error style to named fields.
 */
export function DateInput({
  id,
  namePrefix,
  legend,
  legendSize,
  hint,
  errorMessage,
  errorFields,
  value,
  defaultValue,
  onChange,
  className
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [internalValue, setInternalValue] = useState(defaultValue ?? {})
  const current = value ?? internalValue
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = errorMessage ? `${fieldId}-error` : undefined

  const handleChange = (key) => (event) => {
    const next = { ...current, [key]: event.target.value }
    if (value === undefined) {
      setInternalValue(next)
    }
    onChange?.(next)
  }

  return (
    <div
      className={cx(
        'govuk-form-group',
        errorMessage && 'govuk-form-group--error'
      )}
    >
      <Fieldset
        role="group"
        legend={legend}
        legendSize={legendSize}
        describedBy={joinIds(hintId, errorId)}
      >
        {hint && <Hint id={hintId}>{hint}</Hint>}
        {errorMessage && (
          <ErrorMessage id={errorId}>{errorMessage}</ErrorMessage>
        )}
        <div className={cx('govuk-date-input', className)} id={fieldId}>
          {FIELDS.map((field) => {
            const inputId = `${fieldId}-${field.key}`
            const inError =
              errorMessage && (!errorFields || errorFields.includes(field.key))

            return (
              <div key={field.key} className="govuk-date-input__item">
                <div className="govuk-form-group">
                  <label
                    className="govuk-label govuk-date-input__label"
                    htmlFor={inputId}
                  >
                    {field.label}
                  </label>
                  <input
                    className={cx(
                      'govuk-input govuk-date-input__input',
                      `govuk-input--width-${field.width}`,
                      inError && 'govuk-input--error'
                    )}
                    id={inputId}
                    name={`${namePrefix ?? fieldId}-${field.key}`}
                    type="text"
                    inputMode="numeric"
                    value={current[field.key] ?? ''}
                    onChange={handleChange(field.key)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Fieldset>
    </div>
  )
}
