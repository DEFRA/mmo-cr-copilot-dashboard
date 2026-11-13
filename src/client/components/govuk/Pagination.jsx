import { cx } from './utils.js'

function Arrow({ type }) {
  const path =
    type === 'prev'
      ? 'm6.5938-0.0078125-6.7266 6.7266 6.7441 6.4062 1.377-1.449-4.1856-3.9768h12.896v-2h-12.984l4.2931-4.293-1.414-1.414z'
      : 'm8.107-0.0078125-1.4136 1.414 4.2926 4.293h-12.986v2h12.896l-4.1855 3.9766 1.377 1.4492 6.7441-6.4062-6.7246-6.7266z'

  return (
    <svg
      className={`govuk-pagination__icon govuk-pagination__icon--${type}`}
      xmlns="http://www.w3.org/2000/svg"
      height="13"
      width="15"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 15 13"
    >
      <path d={path} />
    </svg>
  )
}

// A link when there is a URL, otherwise a button styled as a link.
function PaginationLink({ link, children, ...rest }) {
  const handleClick = link.onClick

  if (link.href) {
    return (
      <a
        className="govuk-link govuk-pagination__link"
        href={link.href}
        onClick={handleClick}
        {...rest}
      >
        {children}
      </a>
    )
  }

  return (
    <button
      type="button"
      className="govuk-pagination__link app-link-button"
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  )
}

function ArrowTitle({ link, type, blockLevel }) {
  const defaultText = type === 'prev' ? 'Previous' : 'Next'
  return (
    <span
      className={cx(
        'govuk-pagination__link-title',
        blockLevel &&
          !link.labelText &&
          'govuk-pagination__link-title--decorated'
      )}
    >
      {link.text ?? (
        <>
          {defaultText}
          <span className="govuk-visually-hidden"> page</span>
        </>
      )}
    </span>
  )
}

function ArrowLink({ link, type, blockLevel }) {
  const arrowFirst = blockLevel || type === 'prev'
  const label = blockLevel ? link.labelText : null

  return (
    <div className={`govuk-pagination__${type}`}>
      <PaginationLink link={link} rel={link.href ? type : undefined}>
        {arrowFirst && <Arrow type={type} />}
        <ArrowTitle link={link} type={type} blockLevel={blockLevel} />
        {label && (
          <>
            <span className="govuk-visually-hidden">:</span>
            <span className="govuk-pagination__link-label">{label}</span>
          </>
        )}
        {!arrowFirst && <Arrow type={type} />}
      </PaginationLink>
    </div>
  )
}

/**
 * GOV.UK pagination. `previous`, `next` and each item take `href` or
 * `onClick`; items are `{ number, current }` or `{ ellipsis: true }`.
 */
export function Pagination({
  previous,
  next,
  items,
  landmarkLabel = 'Pagination',
  className
}) {
  const blockLevel = !items?.length && Boolean(previous || next)

  return (
    <nav
      className={cx(
        'govuk-pagination',
        blockLevel && 'govuk-pagination--block',
        className
      )}
      aria-label={landmarkLabel}
    >
      {previous && (
        <ArrowLink link={previous} type="prev" blockLevel={blockLevel} />
      )}
      {items?.length > 0 && (
        <ul className="govuk-pagination__list">
          {items.map((item, index) => (
            <li
              key={item.ellipsis ? `ellipsis-${index}` : item.number}
              className={cx(
                'govuk-pagination__item',
                item.current && 'govuk-pagination__item--current',
                item.ellipsis && 'govuk-pagination__item--ellipsis'
              )}
            >
              {item.ellipsis ? (
                '⋯'
              ) : (
                <PaginationLink
                  link={item}
                  aria-label={item.visuallyHiddenText ?? `Page ${item.number}`}
                  aria-current={item.current ? 'page' : undefined}
                >
                  {item.number}
                </PaginationLink>
              )}
            </li>
          ))}
        </ul>
      )}
      {next && <ArrowLink link={next} type="next" blockLevel={blockLevel} />}
    </nav>
  )
}
