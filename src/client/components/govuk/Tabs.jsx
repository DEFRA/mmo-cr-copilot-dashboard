import { useId, useRef, useState } from 'react'

import { cx } from './utils.js'

/**
 * GOV.UK tabs with the WAI-ARIA tabs pattern implemented in React: roving
 * focus, automatic activation and Left/Right/Home/End keys.
 */
export function Tabs({
  title = 'Contents',
  items,
  defaultSelectedId,
  onChange,
  className
}) {
  const baseId = useId()
  const tabRefs = useRef(new Map())
  const [selectedId, setSelectedId] = useState(defaultSelectedId)
  const activeId = items.some((item) => item.id === selectedId)
    ? selectedId
    : items[0]?.id

  const titleId = `${baseId}-title`
  const tabId = (item) => `${baseId}-tab-${item.id}`
  const panelId = (item) => `${baseId}-panel-${item.id}`

  const select = (item) => {
    setSelectedId(item.id)
    onChange?.(item.id)
  }

  const handleKeyDown = (event, index) => {
    const last = items.length - 1
    const targets = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last
    }
    const next = items[targets[event.key]]
    if (!next) return

    event.preventDefault()
    select(next)
    tabRefs.current.get(next.id)?.focus()
  }

  return (
    <div className={cx('govuk-tabs', className)}>
      <h2 className="govuk-tabs__title" id={titleId}>
        {title}
      </h2>
      <ul className="govuk-tabs__list" role="tablist" aria-labelledby={titleId}>
        {items.map((item, index) => {
          const isSelected = item.id === activeId
          return (
            <li
              key={item.id}
              role="presentation"
              className={cx(
                'govuk-tabs__list-item',
                isSelected && 'govuk-tabs__list-item--selected'
              )}
            >
              <a
                ref={(node) => {
                  if (node) tabRefs.current.set(item.id, node)
                  else tabRefs.current.delete(item.id)
                }}
                className="govuk-tabs__tab"
                href={`#${panelId(item)}`}
                id={tabId(item)}
                role="tab"
                aria-controls={panelId(item)}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={(event) => {
                  event.preventDefault()
                  select(item)
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
      {items.map((item) => {
        const isSelected = item.id === activeId
        return (
          <div
            key={item.id}
            className={cx(
              'govuk-tabs__panel',
              !isSelected && 'govuk-tabs__panel--hidden'
            )}
            id={panelId(item)}
            role="tabpanel"
            aria-labelledby={tabId(item)}
            hidden={!isSelected}
          >
            {item.panel}
          </div>
        )
      })}
    </div>
  )
}
