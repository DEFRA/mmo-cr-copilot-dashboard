// OWASP CSV injection: a spreadsheet runs a cell starting with these as a formula.
const FORMULA_START = /^[=+\-@\t\r]/
const NEEDS_QUOTES = /[",\r\n]/

/** One RFC 4180 cell. Numbers are trusted; text that could run as a formula is prefixed with `'`. */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value !== 'number' && FORMULA_START.test(text)) text = `'${text}`
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(headers, rows) {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n')
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
