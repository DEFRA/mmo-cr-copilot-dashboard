import { useMemo, useState } from 'react'

import { Table } from './Table.jsx'
import { cellSortValue } from './utils.js'

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a ?? ''), String(b ?? ''))
}

const ARROW_PATHS = {
  ascending: ['M6.5625 15.5L11 6.63125L15.4375 15.5H6.5625Z'],
  descending: ['M15.4375 7L11 15.8687L6.5625 7L15.4375 7Z'],
  none: [
    'M8.1875 9.5L10.9609 3.95703L13.7344 9.5H8.1875Z',
    'M13.7344 12.0781L10.9609 17.6211L8.1875 12.0781H13.7344Z'
  ]
}

function SortArrow({ direction }) {
  return (
    <svg
      width="22"
      height="22"
      focusable="false"
      aria-hidden="true"
      viewBox="0 0 22 22"
      fill="none"
    >
      {ARROW_PATHS[direction].map((path) => (
        <path key={path} d={path} fill="currentColor" />
      ))}
    </svg>
  )
}

/**
 * MOJ sortable table, sorted in React. Column `label`s must be strings; set
 * `sortable: false` on a column to leave it unsortable.
 */
export function SortableTable({ caption, head, rows, initialSort, ...rest }) {
  const [sort, setSort] = useState(initialSort ?? null)
  const [announcement, setAnnouncement] = useState('')

  const sortedRows = useMemo(() => {
    const index = head.findIndex((column) => column.id === sort?.id)
    if (index < 0) return rows

    const sign = sort.direction === 'descending' ? -1 : 1
    return [...rows].sort(
      (a, b) =>
        sign *
        compareValues(
          cellSortValue(a.cells[index]),
          cellSortValue(b.cells[index])
        )
    )
  }, [head, rows, sort])

  const handleSort = (column) => {
    const direction =
      sort?.id === column.id && sort.direction === 'ascending'
        ? 'descending'
        : 'ascending'
    setSort({ id: column.id, direction })
    setAnnouncement(`Sorted by ${column.label}, ${direction}`)
  }

  const sortableHead = head.map((column) => {
    if (column.sortable === false) return column

    const ariaSort = sort?.id === column.id ? sort.direction : 'none'
    return {
      ...column,
      ariaSort,
      label: (
        <button type="button" onClick={() => handleSort(column)}>
          {column.label}
          <SortArrow direction={ariaSort} />
        </button>
      )
    }
  })

  return (
    <>
      <Table
        {...rest}
        caption={
          <>
            {caption}
            <span className="govuk-visually-hidden">
              {' (column headers with buttons are sortable).'}
            </span>
          </>
        }
        head={sortableHead}
        rows={sortedRows}
      />
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="govuk-visually-hidden"
      >
        {announcement}
      </div>
    </>
  )
}
