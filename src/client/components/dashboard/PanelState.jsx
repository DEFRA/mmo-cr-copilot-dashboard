import { Button } from '../govuk/Button.jsx'
import { Tag } from '../govuk/Tag.jsx'
import { Icon } from './Icon.jsx'

/**
 * The four panel states from docs/design-system.md §9. Error follows the MOJ
 * API error pattern and never shows internal detail.
 */
export function PanelState({
  state = 'populated',
  title,
  icon = 'bars',
  emptyTag = 'No data for this period',
  emptyMessage = 'Data will appear here as pull requests are processed.',
  errorMessage = 'We could not load this data. Try again later.',
  onRetry,
  children
}) {
  if (state === 'loading') {
    return (
      <div className="app-panel-state app-panel-state--loading">
        <div className="app-skeleton" aria-hidden="true">
          <span className="app-skeleton__line" />
          <span className="app-skeleton__block" />
        </div>
        <output className="govuk-visually-hidden">Loading {title}</output>
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div className="app-panel-state app-panel-state--empty">
        <Icon name={icon} />
        <Tag colour="grey">{emptyTag}</Tag>
        <p className="govuk-body-s app-panel-state__message">{emptyMessage}</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="app-panel-state app-panel-state--error">
        <p className="govuk-heading-s app-panel-state__title">
          Sorry, there is a problem with this data
        </p>
        <p className="govuk-body-s app-panel-state__message">{errorMessage}</p>
        {onRetry && (
          <Button
            variant="secondary"
            className="govuk-!-margin-bottom-0"
            onClick={onRetry}
          >
            Try again<span className="govuk-visually-hidden">: {title}</span>
          </Button>
        )}
      </div>
    )
  }

  return children
}
