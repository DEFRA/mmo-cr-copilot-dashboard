import { useId } from 'react'

import { cx } from '../govuk/utils.js'
import { familyClass } from './families.js'
import { Icon } from './Icon.jsx'
import { headingCase } from './KpiCard.jsx'

/**
 * Section panel: 8px left family band, heading and an actions slot. Renders as
 * a `figure` for ChartFigure; `busy` marks it as loading.
 */
export function Panel({
  title,
  family = 'speed',
  icon,
  aside,
  actions,
  headingLevel = 3,
  as: Element = 'section',
  busy = false,
  className,
  children
}) {
  const titleId = useId()
  const Heading = `h${headingLevel}`

  return (
    <Element
      className={cx('app-panel', familyClass(family), className)}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
    >
      <div className="app-panel__head">
        {icon && (
          <span className="app-panel__icon">
            <Icon name={icon} size={20} />
          </span>
        )}
        <Heading className="app-panel__title" id={titleId}>
          {headingCase(title)}
        </Heading>
        {(aside || actions) && (
          <div className="app-panel__aside">
            {aside}
            {actions}
          </div>
        )}
      </div>
      {children}
    </Element>
  )
}
