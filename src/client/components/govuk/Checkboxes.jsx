import { Fragment, useId } from 'react'

import { ErrorMessage } from './ErrorMessage.jsx'
import { Fieldset } from './Fieldset.jsx'
import { Hint } from './Hint.jsx'
import { cx, joinIds } from './utils.js'

/**
 * GOV.UK checkboxes. The first input's id is `idPrefix`, so an error summary
 * link to `#idPrefix` focuses it. `value` is the array of checked values and
 * `onChange` receives the next array. An item's `conditional` content shows
 * while that item is checked (controlled `value` only).
 */
export function Checkboxes({
  idPrefix,
  name,
  legend,
  legendSize,
  hint,
  errorMessage,
  items,
  value,
  defaultValue = [],
  onChange,
  small = false,
  className
}) {
  const generatedId = useId()
  const prefix = idPrefix ?? generatedId
  const hintId = hint ? `${prefix}-hint` : undefined
  const errorId = errorMessage ? `${prefix}-error` : undefined

  const toggle = (item, checked) => {
    const current = value ?? []
    onChange?.(
      checked
        ? [...current, item.value]
        : current.filter((v) => v !== item.value)
    )
  }

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
            'govuk-checkboxes',
            small && 'govuk-checkboxes--small',
            className
          )}
        >
          {items.map((item, index) => {
            const itemId = index === 0 ? prefix : `${prefix}-${index + 1}`
            const itemHintId = item.hint ? `${itemId}-item-hint` : undefined
            const checkedProps =
              value === undefined
                ? { defaultChecked: defaultValue.includes(item.value) }
                : { checked: value.includes(item.value) }
            const conditionalId = item.conditional
              ? `${itemId}-conditional`
              : undefined
            const revealed = Boolean(
              item.conditional && value?.includes(item.value)
            )

            return (
              <Fragment key={item.value}>
                <div className="govuk-checkboxes__item">
                  <input
                    className="govuk-checkboxes__input"
                    id={itemId}
                    name={name ?? prefix}
                    type="checkbox"
                    value={item.value}
                    disabled={item.disabled}
                    aria-describedby={itemHintId}
                    aria-controls={revealed ? conditionalId : undefined}
                    onChange={(event) => toggle(item, event.target.checked)}
                    {...checkedProps}
                  />
                  <label
                    className="govuk-label govuk-checkboxes__label"
                    htmlFor={itemId}
                  >
                    {item.text}
                  </label>
                  {item.hint && (
                    <Hint id={itemHintId} className="govuk-checkboxes__hint">
                      {item.hint}
                    </Hint>
                  )}
                </div>
                {revealed && (
                  <div
                    className="govuk-checkboxes__conditional"
                    id={conditionalId}
                  >
                    {item.conditional}
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </Fieldset>
    </div>
  )
}
