import { render, screen, within } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { Table } from './Table.jsx'

const HEAD = [
  { id: 'repository', label: 'Repository' },
  { id: 'commits', label: 'Commits', numeric: true }
]

const ROWS = [
  { id: 'api', cells: ['api', 12] },
  { id: 'web', cells: [{ content: 'web', sortValue: 'web' }, 4] }
]

describe('#Table', () => {
  test('Should take its accessible name from the caption', () => {
    render(<Table caption="Commits by repository" head={HEAD} rows={ROWS} />)

    expect(
      screen.getByRole('table', { name: 'Commits by repository' })
    ).toBeInTheDocument()
  })

  test('Should scope column and row headers', () => {
    render(<Table caption="Commits" head={HEAD} rows={ROWS} />)

    expect(
      screen.getByRole('columnheader', { name: 'Commits' })
    ).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('rowheader', { name: 'web' })).toHaveAttribute(
      'scope',
      'row'
    )
  })

  test('Should align numeric headers and cells', () => {
    render(<Table caption="Commits" head={HEAD} rows={ROWS} />)

    expect(screen.getByRole('columnheader', { name: 'Commits' })).toHaveClass(
      'govuk-table__header--numeric'
    )
    expect(screen.getByRole('cell', { name: '12' })).toHaveClass(
      'govuk-table__cell--numeric'
    )
  })

  test('Should render plain cells when the first cell is not a header', () => {
    render(
      <Table
        caption="Commits"
        head={HEAD}
        rows={ROWS}
        firstCellIsHeader={false}
      />
    )

    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument()
    const [, firstRow] = screen.getAllByRole('row')
    expect(within(firstRow).getByRole('cell', { name: 'api' })).toHaveClass(
      'govuk-table__cell'
    )
  })

  test('Should size or hide the caption', () => {
    render(
      <Table
        caption="Commits"
        captionSize="m"
        captionHidden
        head={HEAD}
        rows={ROWS}
      />
    )

    expect(screen.getByText('Commits', { selector: 'caption' })).toHaveClass(
      'govuk-table__caption--m',
      'govuk-visually-hidden'
    )
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <Table caption="Commits" head={HEAD} rows={ROWS} />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
