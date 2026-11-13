import { useState } from 'react'

import { Table, TextInput } from '../govuk'
import { cx } from '../govuk/utils.js'

// A list longer than this gets a search box, unless it always has one.
const SEARCH_THRESHOLD = 5

function resultText(needle, shown, items, noun, query) {
  if (!needle) {
    return ''
  }
  return shown.length === 0
    ? `No ${noun} match “${query.trim()}”`
    : `Showing ${shown.length} of ${items.length} ${noun}`
}

/** A repository table in a scrolling container, with a search box once it is long. */
export function SearchableTable({
  noun,
  items,
  alwaysSearch = false,
  caption,
  head,
  searchText,
  toRow
}) {
  const [query, setQuery] = useState('')
  const searchable = alwaysSearch || items.length > SEARCH_THRESHOLD
  const needle = searchable ? query.trim().toLowerCase() : ''
  const shown = needle
    ? items.filter((item) => searchText(item).toLowerCase().includes(needle))
    : items

  return (
    <>
      {searchable && (
        <>
          <TextInput
            type="search"
            label={`Search ${noun}`}
            labelSize="s"
            width="30"
            spellCheck={false}
            autoComplete="off"
            formGroupClassName="govuk-!-margin-bottom-2"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <output
            className={cx(
              'govuk-hint app-block',
              !needle && 'govuk-visually-hidden'
            )}
          >
            {resultText(needle, shown, items, noun, query)}
          </output>
        </>
      )}
      {shown.length > 0 && (
        <div className="app-scroll-list">
          <Table
            className="govuk-!-margin-bottom-0"
            caption={caption}
            captionHidden
            head={head}
            rows={shown.map(toRow)}
          />
        </div>
      )}
    </>
  )
}
