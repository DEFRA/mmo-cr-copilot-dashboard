import { isValidElement } from 'react'

export const cx = (...classes) => classes.filter(Boolean).join(' ')

export const joinIds = (...ids) => cx(...ids) || undefined

// A click the app may handle itself; modified clicks open a new tab or window.
export const isPlainClick = (event) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

// A table cell is a plain value, an element, or `{ content, sortValue }`.
const isCellObject = (cell) =>
  cell !== null &&
  typeof cell === 'object' &&
  !isValidElement(cell) &&
  ('content' in cell || 'children' in cell)

export const cellContent = (cell) =>
  isCellObject(cell) ? (cell.content ?? cell.children) : cell

export const cellSortValue = (cell) =>
  isCellObject(cell) ? (cell.sortValue ?? cell.content ?? cell.children) : cell
