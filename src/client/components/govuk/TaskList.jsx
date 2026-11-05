import { useId } from 'react'

import { Tag } from './Tag.jsx'
import { cx, joinIds } from './utils.js'

/**
 * GOV.UK task list. Each item is `{ title, href, onClick, hint, status }`
 * where `status` is `{ text, tag, colour }`. An item with no `href` is a task
 * that cannot be opened yet; its status text is greyed instead of tagged.
 */
export function TaskList({ items, className, idPrefix }) {
  const generatedId = useId()
  const prefix = idPrefix ?? generatedId

  return (
    <ul className={cx('govuk-task-list', className)}>
      {items.map((item, index) => {
        const hintId = item.hint ? `${prefix}-${index}-hint` : undefined
        const statusId = `${prefix}-${index}-status`
        const { status } = item
        const handleClick = item.onClick
        return (
          <li
            key={item.title}
            className={cx(
              'govuk-task-list__item',
              item.href && 'govuk-task-list__item--with-link'
            )}
          >
            <div className="govuk-task-list__name-and-hint">
              {item.href ? (
                <a
                  className="govuk-link govuk-task-list__link"
                  href={item.href}
                  onClick={handleClick}
                  aria-describedby={joinIds(hintId, statusId)}
                >
                  {item.title}
                </a>
              ) : (
                <div>{item.title}</div>
              )}
              {item.hint && (
                <div id={hintId} className="govuk-task-list__hint">
                  {item.hint}
                </div>
              )}
            </div>
            <div
              className={cx(
                'govuk-task-list__status',
                !status.tag && 'govuk-task-list__status--cannot-start-yet'
              )}
              id={statusId}
            >
              {status.tag ? (
                <Tag colour={status.colour}>{status.text}</Tag>
              ) : (
                status.text
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
