import { cx } from '../govuk/utils.js'

export const PROJECT_GONE = 'That project no longer exists'

/** Project choices for a Select, led by a blank prompt. */
export const projectOptions = (projects) => [
  { value: '', text: 'Select a project' },
  ...projects.map((p) => ({ value: p.slug, text: p.name }))
]

export function TextField({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  width,
  list
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={cx('govuk-form-group', error && 'govuk-form-group--error')}>
      <label className="govuk-label govuk-label--s" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <div id={hintId} className="govuk-hint">
          {hint}
        </div>
      )}
      {error && (
        <p id={errorId} className="govuk-error-message">
          <span className="govuk-visually-hidden">Error:</span> {error}
        </p>
      )}
      <input
        className={cx(
          'govuk-input',
          width && `govuk-input--width-${width}`,
          error && 'govuk-input--error'
        )}
        id={id}
        type="text"
        spellCheck={false}
        list={list}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(' ') || undefined
        }
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
