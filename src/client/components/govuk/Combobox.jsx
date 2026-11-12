import { useEffect, useId, useState } from 'react'

import {
  FieldLabel,
  FieldMessages,
  describedByIds,
  formGroupClass
} from './FieldParts.jsx'
import { cx, joinIds } from './utils.js'

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase()

function ComboboxOptions({
  items,
  active,
  listId,
  labelId,
  optionId,
  onChoose
}) {
  return (
    <ul
      className="app-combobox__list"
      id={listId}
      role="listbox"
      aria-labelledby={labelId}
    >
      {items.map((item, index) => {
        const choose = () => onChoose(item.value, Boolean(item.custom))
        return (
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
            onClick={choose}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                choose()
              }
            }}
          >
            {item.text}
          </li>
        )
      })}
    </ul>
  )
}

// Typing changes the count on every key; announce only once the user pauses.
export const ANNOUNCE_DELAY_MS = 1400

// Options containing the typed text, plus an "Add" item for new custom text.
function comboboxItems({ value, options, allowCustom, addText }) {
  const query = value.trim()
  const needle = query.toLowerCase()
  const found = query
    ? options.filter((option) => option.toLowerCase().includes(needle))
    : options
  const canAdd =
    allowCustom && query && !options.some((option) => sameText(option, query))
  const items = found.map((text) => ({ value: text, text }))
  if (canAdd) {
    items.push({ value: query, text: addText(query), custom: true })
  }
  return { query, found, canAdd, items }
}

function statusMessage({
  open,
  found,
  query,
  canAdd,
  itemName,
  itemNamePlural
}) {
  if (!open) {
    return ''
  }
  if (found.length > 0) {
    const noun = found.length === 1 ? itemName : itemNamePlural
    return `${found.length} ${noun} found`
  }
  if (!query) {
    return ''
  }
  const hint = canAdd ? ', press Enter to add' : ''
  return `No matching ${itemNamePlural}${hint}`
}

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
  const { hintId, errorId } = describedByIds(fieldId, hint, errorMessage)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [announced, setAnnounced] = useState('')

  const { query, found, canAdd, items } = comboboxItems({
    value,
    options,
    allowCustom,
    addText
  })
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
    if (items.length === 0) {
      return
    }
    const from = expanded ? active : -1
    const first = step > 0 ? 0 : items.length - 1
    setOpen(true)
    setActive(from < 0 ? first : (from + step + items.length) % items.length)
  }

  // Each handler returns true when it handled the key, so the default is prevented.
  const keyHandlers = {
    ArrowDown: () => {
      move(1)
      return true
    },
    ArrowUp: () => {
      move(-1)
      return true
    },
    Enter: () => {
      if (activeItem) {
        choose(activeItem.value, Boolean(activeItem.custom))
        return true
      }
      if (allowCustom && query) {
        choose(query, true)
        return true
      }
      return false
    },
    Escape: () => {
      if (open) {
        close()
        return true
      }
      if (value) {
        onChange('')
        return true
      }
      return false
    }
  }

  const handleKeyDown = (event) => {
    const handler = Object.hasOwn(keyHandlers, event.key)
      ? keyHandlers[event.key]
      : null
    if (handler?.()) {
      event.preventDefault()
    }
  }

  const message = statusMessage({
    open,
    found,
    query,
    canAdd,
    itemName,
    itemNamePlural
  })

  useEffect(() => {
    if (!message) {
      setAnnounced('')
      return undefined
    }
    const timer = setTimeout(() => setAnnounced(message), ANNOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <div className={formGroupClass(errorMessage, formGroupClassName)}>
      <FieldLabel
        fieldId={fieldId}
        labelId={`${fieldId}-label`}
        size={labelSize}
      >
        {label}
      </FieldLabel>
      <FieldMessages
        hint={hint}
        hintId={hintId}
        errorMessage={errorMessage}
        errorId={errorId}
      />
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
          <ComboboxOptions
            items={items}
            active={active}
            listId={listId}
            labelId={`${fieldId}-label`}
            optionId={optionId}
            onChoose={choose}
          />
        )}
      </div>
      <output className="govuk-visually-hidden">{announced}</output>
    </div>
  )
}
