import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { SortableTable } from './SortableTable.jsx'

const HEAD = [
  { id: 'title', label: 'Pull request' },
  { id: 'lines', label: 'Lines', numeric: true },
  { id: 'status', label: 'Status', sortable: false }
]

const ROWS = [
  { id: 'b', cells: ['Beta', 30, 'Open'] },
  { id: 'a', cells: ['alpha', 5, 'Merged'] },
  {
    id: 'c',
    cells: [{ content: <span>Gamma</span>, sortValue: 'Gamma' }, 120, 'Draft']
  }
]

const rowHeaderNames = () =>
  screen.getAllByRole('rowheader').map((cell) => cell.textContent)

const renderTable = (props = {}) =>
  render(
    <SortableTable caption="Pull requests" head={HEAD} rows={ROWS} {...props} />
  )

describe('#SortableTable', () => {
  test('Should tell users the column headers are sortable', () => {
    renderTable()

    expect(
      screen.getByRole('table', {
        name: /^Pull requests\s?\(column headers with buttons are sortable\)\.$/
      })
    ).toBeInTheDocument()
  })

  test('Should start unsorted with buttons only on sortable columns', () => {
    renderTable()

    expect(
      screen.getByRole('columnheader', { name: 'Pull request' })
    ).toHaveAttribute('aria-sort', 'none')
    expect(
      screen.getByRole('columnheader', { name: 'Status' })
    ).not.toHaveAttribute('aria-sort')
    expect(
      screen.queryByRole('button', { name: 'Status' })
    ).not.toBeInTheDocument()
    expect(rowHeaderNames()).toStrictEqual(['Beta', 'alpha', 'Gamma'])
  })

  test('Should cycle ascending then descending and announce it', async () => {
    renderTable()
    const header = screen.getByRole('columnheader', { name: 'Pull request' })
    const button = screen.getByRole('button', { name: 'Pull request' })

    await userEvent.click(button)
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    expect(rowHeaderNames()).toStrictEqual(['alpha', 'Beta', 'Gamma'])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Pull request, ascending'
    )

    await userEvent.click(button)
    expect(header).toHaveAttribute('aria-sort', 'descending')
    expect(rowHeaderNames()).toStrictEqual(['Gamma', 'Beta', 'alpha'])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Pull request, descending'
    )

    await userEvent.click(button)
    expect(header).toHaveAttribute('aria-sort', 'ascending')
  })

  test('Should sort numbers numerically and reset other columns', async () => {
    renderTable({ initialSort: { id: 'title', direction: 'ascending' } })

    await userEvent.click(screen.getByRole('button', { name: 'Lines' }))

    expect(rowHeaderNames()).toStrictEqual(['alpha', 'Beta', 'Gamma'])
    expect(
      screen.getByRole('columnheader', { name: 'Pull request' })
    ).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('columnheader', { name: 'Lines' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )
  })

  test('Should sort missing values as empty text', async () => {
    renderTable({
      rows: [...ROWS, { id: 'd', cells: [null, 1, 'Open'] }]
    })

    await userEvent.click(screen.getByRole('button', { name: 'Pull request' }))

    expect(rowHeaderNames()).toStrictEqual(['', 'alpha', 'Beta', 'Gamma'])
  })

  test('Should have no axe violations', async () => {
    const { container } = renderTable()

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
