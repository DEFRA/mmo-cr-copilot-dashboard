import { cx } from './utils.js'

function ActionLink({ action, cardTitle }) {
  const handleClick = action.onClick
  const hiddenText = [action.visuallyHiddenText, cardTitle && `(${cardTitle})`]
    .filter(Boolean)
    .join(' ')

  return (
    <a
      className={cx('govuk-link', action.className)}
      href={action.href}
      onClick={handleClick}
    >
      {action.text}
      {hiddenText && (
        <>
          {' '}
          <span className="govuk-visually-hidden">{hiddenText}</span>
        </>
      )}
    </a>
  )
}

function RowActions({ actions, cardTitle }) {
  if (actions.length === 1) {
    return <ActionLink action={actions[0]} cardTitle={cardTitle} />
  }

  return (
    <ul className="govuk-summary-list__actions-list">
      {actions.map((action) => (
        <li key={action.text} className="govuk-summary-list__actions-list-item">
          <ActionLink action={action} cardTitle={cardTitle} />
        </li>
      ))}
    </ul>
  )
}

/**
 * GOV.UK summary list. Each row is `{ id, key, value, actions }`; an action is
 * `{ href, text, visuallyHiddenText }`.
 */
export function SummaryList({ rows, noBorder = false, cardTitle, className }) {
  const anyRowHasActions = rows.some((row) => row.actions?.length)

  return (
    <dl
      className={cx(
        'govuk-summary-list',
        noBorder && 'govuk-summary-list--no-border',
        className
      )}
    >
      {rows.map((row) => {
        const hasActions = Boolean(row.actions?.length)

        return (
          <div
            key={row.id ?? row.key}
            className={cx(
              'govuk-summary-list__row',
              anyRowHasActions &&
                !hasActions &&
                'govuk-summary-list__row--no-actions'
            )}
          >
            <dt className="govuk-summary-list__key">{row.key}</dt>
            <dd className="govuk-summary-list__value">{row.value}</dd>
            {hasActions && (
              <dd className="govuk-summary-list__actions">
                <RowActions actions={row.actions} cardTitle={cardTitle} />
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}

/** GOV.UK summary card: a titled summary list with optional card actions. */
export function SummaryCard({
  title,
  headingLevel = 2,
  actions = [],
  rows,
  noBorder,
  className
}) {
  const Heading = `h${headingLevel}`

  return (
    <div className={cx('govuk-summary-card', className)}>
      <div className="govuk-summary-card__title-wrapper">
        <Heading className="govuk-summary-card__title">{title}</Heading>
        {actions.length === 1 && (
          <div className="govuk-summary-card__actions">
            <ActionLink action={actions[0]} cardTitle={title} />
          </div>
        )}
        {actions.length > 1 && (
          <ul className="govuk-summary-card__actions">
            {actions.map((action) => (
              <li key={action.text} className="govuk-summary-card__action">
                <ActionLink action={action} cardTitle={title} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="govuk-summary-card__content">
        <SummaryList rows={rows} noBorder={noBorder} cardTitle={title} />
      </div>
    </div>
  )
}
