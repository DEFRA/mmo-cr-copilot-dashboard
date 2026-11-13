import { cx, isPlainClick } from './utils.js'

/**
 * GOV.UK breadcrumbs. The last item is the current page as plain text. With
 * `onNavigate`, links report the chosen item instead of following the hash.
 */
export function Breadcrumbs({
  items,
  onNavigate,
  label = 'Breadcrumb',
  collapseOnMobile = false,
  className
}) {
  const lastIndex = items.length - 1

  const handleClick = (event, item) => {
    if (!onNavigate || !isPlainClick(event)) {
      return
    }
    event.preventDefault()
    onNavigate(item)
  }

  return (
    <nav
      className={cx(
        'govuk-breadcrumbs',
        collapseOnMobile && 'govuk-breadcrumbs--collapse-on-mobile',
        className
      )}
      aria-label={label}
    >
      <ol className="govuk-breadcrumbs__list">
        {items.map((item, index) =>
          index === lastIndex ? (
            <li
              key={item.id ?? item.label}
              className="govuk-breadcrumbs__list-item"
              aria-current="page"
            >
              {item.label}
            </li>
          ) : (
            <li
              key={item.id ?? item.label}
              className="govuk-breadcrumbs__list-item"
            >
              <a
                className="govuk-breadcrumbs__link"
                href={item.href}
                onClick={(event) => handleClick(event, item)}
              >
                {item.label}
              </a>
            </li>
          )
        )}
      </ol>
    </nav>
  )
}
