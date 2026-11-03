import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { ChartFigure } from './ChartFigure.jsx'

const columns = [
  { id: 'repo', label: 'Repository' },
  { id: 'rate', label: 'Commit assist rate (%)', numeric: true }
]
const rows = [
  ['mmo-cr-pdf', 1250.5],
  ['=cmd()', 40]
]

const renderFigure = (props = {}) =>
  render(
    <ChartFigure
      number={3}
      title="Commit assist rate by repository"
      subtitle="Share of commits, live sprint"
      description="mmo-cr-pdf leads."
      columns={columns}
      rows={rows}
      family="assist"
      chip="Live sprint"
      {...props}
    >
      <div data-testid="chart" />
    </ChartFigure>
  )

afterEach(() => {
  vi.restoreAllMocks()
})

describe('#ChartFigure', () => {
  test('Should be a figure named by its title with the chart and chip', () => {
    renderFigure()

    const figure = screen.getByRole('figure', {
      name: 'Commit Assist Rate by Repository'
    })
    expect(figure).toHaveClass('app-panel', 'app-figure', 'app-family--assist')
    expect(within(figure).getByTestId('chart')).toBeInTheDocument()
    expect(within(figure).getByText('Live sprint')).toHaveClass('app-mini-tag')
  })

  test('Should collapse the data and description behind a numbered summary', async () => {
    renderFigure()

    const details = screen.getByRole('group')
    expect(details).not.toHaveAttribute('open')
    expect(details.querySelector('summary')).toHaveTextContent(
      'Data and description for figure 3'
    )

    await userEvent.click(screen.getByText(/Data and description/))

    expect(details).toHaveAttribute('open')
    expect(details).toHaveTextContent('Figure 3: Share of commits, live sprint')
    expect(details).toHaveTextContent('mmo-cr-pdf leads.')
  })

  test('Should give the data table a caption and formatted numeric cells', () => {
    renderFigure()

    const table = screen.getByRole('table', {
      name: 'Figure 3: Commit Assist Rate by Repository'
    })
    expect(
      within(table).getByRole('rowheader', { name: 'mmo-cr-pdf' })
    ).toBeInTheDocument()
    expect(within(table).getByText('1,250.5')).toHaveClass(
      'govuk-table__cell--numeric'
    )
  })

  test('Should download the data as escaped CSV', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fig')
    URL.revokeObjectURL = vi.fn()
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    renderFigure()

    const link = screen.getByRole('link', {
      name: 'Download the data for figure 3 (CSV)'
    })
    expect(link).toHaveAttribute('download', 'figure-3.csv')
    await userEvent.click(link)

    const [blob] = URL.createObjectURL.mock.calls[0]
    expect(blob.type).toBe('text/csv')
    expect(await blob.text()).toBe(
      "Repository,Commit assist rate (%)\r\nmmo-cr-pdf,1250.5\r\n'=cmd(),40"
    )
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fig')
  })

  test('Should show the empty state and no details when there are no rows', () => {
    renderFigure({ rows: [] })

    expect(screen.getByText('No data for this period')).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  test('Should mark itself busy while loading', () => {
    renderFigure({ state: 'loading' })

    expect(screen.getByRole('figure')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading Commit assist rate by repository'
    )
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  test('Should offer a retry in the error state', async () => {
    const onRetry = vi.fn()
    renderFigure({ state: 'error', onRetry })

    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  test('Should have no axe violations', async () => {
    const { container } = renderFigure()

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
