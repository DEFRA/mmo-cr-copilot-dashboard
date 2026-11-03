import { cellContent, cx } from './utils.js'

/**
 * GOV.UK table. `head` is `[{ id, label, numeric, ariaSort }]`; each row is
 * `{ id, cells }` with one cell per column.
 */
export function Table({
  caption,
  captionSize,
  captionHidden = false,
  head,
  rows,
  firstCellIsHeader = true,
  className,
  ...rest
}) {
  return (
    <table className={cx('govuk-table', className)} {...rest}>
      <caption
        className={cx(
          'govuk-table__caption',
          captionSize && `govuk-table__caption--${captionSize}`,
          captionHidden && 'govuk-visually-hidden'
        )}
      >
        {caption}
      </caption>
      <thead className="govuk-table__head">
        <tr className="govuk-table__row">
          {head.map((column, colIdx) => (
            <th
              key={column.id ?? colIdx}
              scope="col"
              aria-sort={column.ariaSort}
              className={cx(
                'govuk-table__header',
                column.numeric && 'govuk-table__header--numeric',
                column.className
              )}
            >
              {column.label ?? column.children}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="govuk-table__body">
        {rows.map((row, rowIdx) => {
          const cells = Array.isArray(row) ? row : (row.cells ?? [])
          const rowKey = row.id ?? rowIdx

          return (
            <tr key={rowKey} className="govuk-table__row">
              {cells.map((cell, index) => {
                const column = head[index]
                const numeric = column?.numeric
                const key = column?.id ?? index

                return firstCellIsHeader && index === 0 ? (
                  <th
                    key={key}
                    scope="row"
                    className={cx(
                      'govuk-table__header',
                      numeric && 'govuk-table__header--numeric'
                    )}
                  >
                    {cellContent(cell)}
                  </th>
                ) : (
                  <td
                    key={key}
                    className={cx(
                      'govuk-table__cell',
                      numeric && 'govuk-table__cell--numeric'
                    )}
                  >
                    {cellContent(cell)}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
