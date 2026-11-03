import { useId } from 'react'

import { ErrorMessage } from './ErrorMessage.jsx'
import { Fieldset } from './Fieldset.jsx'
import { Hint } from './Hint.jsx'
import { cx, joinIds } from './utils.js'

/**
 * GOV.UK radios. The first input's id is `idPrefix`, so an error summary link
 * to `#idPrefix` focuses it. `onChange` receives the chosen value.
 */
export function Radios({
  idPrefix,
  name,
  legend,
  legendSize,
  hint,
  errorMessage,
  items,
  value,
  defaultValue,
  onChange,
  inline = false,
  small = false,
  className
}) {
  const generatedId = useId()
  const prefix = idPrefix ?? generatedId
  const hintId = hint ? `${prefix}-hint` : undefined
  const errorId = errorMessage ? `${prefix}-error` : undefined

  return (
    <div
      className={cx(
        'govuk-form-group',
        errorMessage && 'govuk-form-group--error'
      )}
    >
      <Fieldset
        legend={legend}
        legendSize={legendSize}
        describedBy={joinIds(hintId, errorId)}
      >
        {hint && <Hint id={hintId}>{hint}</Hint>}
        {errorMessage && (
          <ErrorMessage id={errorId}>{errorMessage}</ErrorMessage>
        )}
        <div
          className={cx(
            'govuk-radios',
            inline && 'govuk-radios--inline',
            small && 'govuk-radios--small',
            className
          )}
        >
          {items.map((item, index) => {
            const itemId = index === 0 ? prefix : `${prefix}-${index + 1}`
            const itemHintId = item.hint ? `${itemId}-item-hint` : undefined
            const checkedProps =
              value === undefined
                ? { defaultChecked: defaultValue === item.value }
                : { checked: value === item.value }

            return (
              <div key={item.value} className="govuk-radios__item">
                <input
                  className="govuk-radios__input"
                  id={itemId}
                  name={name ?? prefix}
                  type="radio"
                  value={item.value}
                  disabled={item.disabled}
                  aria-describedby={itemHintId}
                  onChange={(event) => onChange?.(event.target.value)}
                  {...checkedProps}
                />
                <label
                  className="govuk-label govuk-radios__label"
                  htmlFor={itemId}
                >
                  {item.text}
                </label>
                {item.hint && (
                  <Hint id={itemHintId} className="govuk-radios__hint">
                    {item.hint}
                  </Hint>
                )}
              </div>
            )
          })}
        </div>
      </Fieldset>
    </div>
  )
}
