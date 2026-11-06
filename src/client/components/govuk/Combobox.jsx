import { useEffect, useId, useState } from 'react'

import { ErrorMessage } from './ErrorMessage.jsx'
import { Hint } from './Hint.jsx'
import { cx, joinIds } from './utils.js'

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase()

// Typing changes the count on every key; announce only once the user pauses.
export const ANNOUNCE_DELAY_MS = 1400

/**
 * Text input with a filtered listbox, after the WAI-ARIA APG combobox with
 * list autocomplete. The caller owns `value`; choosing an option, or pressing
 * Enter on typed text when `allowCustom` is set, calls
 * `onSelect(text, { custom })`. Home and End stay with the text caret.
 */
export function Combobox({
  id,
  label,
  labelSize,
  hint,
  errorMessage,
  value,
  onChange,
  options,
  onSelect,
  allowCustom = false,
  addText = (text) => `Add ${text}`,
  itemName = 'result',
  itemNamePlural = 'results',
  inputRef,
  className,
  formGroupClassName,
  ...rest
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const listId = `${fieldId}-listbox`
  const optionId = (index) => `${fieldId}-option-${index}`
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = errorMessage ? `${fieldId}-error` : undefined
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [announced, setAnnounced] = useState('')

  const query = value.trim()
  const found = query
    ? options.filter((option) =>
        option.toLowerCase().includes(query.toLowerCase())
      )
    : options
  const canAdd =
    allowCustom && query && !options.some((option) => sameText(option, query))
  const items = [
    ...found.map((text) => ({ value: text, text })),
    ...(canAdd ? [{ value: query, text: addText(query), custom: true }] : [])
  ]
  const expanded = open && items.length > 0
  const activeItem = expanded ? items[active] : undefined

  useEffect(() => {
    if (active >= 0) {
      document
        .getElementById(`${fieldId}-option-${active}`)
        ?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [active, fieldId])

  const close = () => {
    setOpen(false)
    setActive(-1)
  }

  const choose = (text, custom) => {
    close()
    onSelect(text, { custom })
  }

  const move = (step) => {
    if (items.length === 0) return
    const from = expanded ? active : -1
    const first = step > 0 ? 0 : items.length - 1
    setOpen(true)
    setActive(from < 0 ? first : (from + step + items.length) % items.length)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      if (activeItem) {
        event.preventDefault()
        choose(activeItem.value, Boolean(activeItem.custom))
      } else if (allowCustom && query) {
        event.preventDefault()
        choose(query, true)
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        close()
      } else if (value) {
        event.preventDefault()
        onChange('')
      }
    }
  }

  let message = ''
  if (open && found.length > 0) {
    message = `${found.length} ${found.length === 1 ? itemName : itemNamePlural} found`
  } else if (open && query) {
    message = `No matching ${itemNamePlural}${canAdd ? ', press Enter to add' : ''}`
  }

  useEffect(() => {
    if (!message) {
      setAnnounced('')
      return undefined
    }
    const timer = setTimeout(() => setAnnounced(message), ANNOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [message])

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
        id={`${fieldId}-label`}
      >
        {label}
      </label>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {errorMessage && <ErrorMessage id={errorId}>{errorMessage}</ErrorMessage>}
      <div className="app-combobox">
        <input
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          {...rest}
          className={cx(
            'govuk-input',
            errorMessage && 'govuk-input--error',
            className
          )}
          id={fieldId}
          name={fieldId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={activeItem ? optionId(active) : undefined}
          aria-describedby={joinIds(hintId, errorId)}
          aria-invalid={errorMessage ? true : undefined}
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onKeyDown={handleKeyDown}
          onClick={() => setOpen(true)}
          onBlur={close}
        />
        {expanded && (
          <ul
            className="app-combobox__list"
            id={listId}
            role="listbox"
            aria-labelledby={`${fieldId}-label`}
          >
            {items.map((item, index) => (
              <li
                key={item.custom ? `add:${item.value}` : item.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className={cx(
                  'app-combobox__option',
                  item.custom && 'app-combobox__option--add'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item.value, Boolean(item.custom))}
              >
                {item.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div role="status" className="govuk-visually-hidden">
        {announced}
      </div>
    </div>
  )
}
