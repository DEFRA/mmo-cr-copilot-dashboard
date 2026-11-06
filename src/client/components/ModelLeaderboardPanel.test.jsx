import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { ModelLeaderboardPanel } from './ModelLeaderboardPanel.jsx'

const model = (overrides) => ({
  model: 'gpt-5',
  rank: 1,
  requests: 12000,
  requestShare: 50,
  credits: 1500.5,
  creditsPerRequest: 0.1251,
  creditShare: 55.2,
  prCount: 40,
  ...overrides
})

const MODELS = [
  model(),
  model({
    model: 'claude-sonnet',
    rank: 2,
    requests: 8000,
    requestShare: 33,
    credits: 1200,
    creditsPerRequest: 0.15,
    creditShare: 44.1,
    prCount: 30
  }),
  model({
    model: 'gemini',
    rank: 3,
    requests: 3000,
    requestShare: 12,
    credits: 0.004,
    creditsPerRequest: 0.000001,
    creditShare: 0,
    prCount: 10
  }),
  model({
    model: 'o-series',
    rank: null,
    requests: 100.5,
    requestShare: 1,
    credits: null,
    creditsPerRequest: null,
    creditShare: null,
    prCount: 2
  })
]

const rowFor = (name) =>
  screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr')

describe('#ModelLeaderboardPanel', () => {
  test('Should render the heading and a row per model', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    expect(
      screen.getByRole('heading', { name: 'Model Leaderboard', level: 4 })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(MODELS.length + 1)

    const cells = within(rowFor('gpt-5')).getAllByRole('cell')
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '12,000',
      '50%',
      '1,500.50',
      '0.13',
      '55.2%',
      '40'
    ])
  })

  test('Should show credits as not recorded, with dashes for what depends on them', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    const cells = within(rowFor('o-series')).getAllByRole('cell')
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '100.5',
      '1%',
      'Not recorded',
      '–',
      '–',
      '2'
    ])
  })

  test('Should show a tiny non-zero amount as under 0.01, never as zero', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    const cells = within(rowFor('gemini')).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent('Under 0.01')
    expect(cells[3]).toHaveTextContent('Under 0.01')
  })

  test('Should crown only the favourite model, with a text alternative', () => {
    render(<ModelLeaderboardPanel models={MODELS} favourite="claude-sonnet" />)

    expect(screen.getAllByText('Team favourite')).toHaveLength(1)
    expect(
      within(rowFor('claude-sonnet')).getByText('Team favourite')
    ).toHaveClass('govuk-visually-hidden')
    expect(
      rowFor('claude-sonnet').querySelector('.app-crown svg')
    ).toHaveAttribute('aria-hidden', 'true')
    expect(rowFor('gpt-5').querySelector('.app-crown')).toBeNull()
    expect(document.querySelector('.govuk-tag--purple')).toBeNull()
  })

  test('Should leave out token columns', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    expect(
      screen.queryByRole('columnheader', { name: /Token|Reasoning|Cache/ })
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(7)
  })

  test('Should stack the share value above its meter', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    const cells = within(rowFor('gpt-5')).getAllByRole('cell')
    const share = cells[1].querySelector('.app-leaderboard__stack')
    expect(share.firstElementChild).toHaveTextContent('50%')
    expect(share.lastElementChild).toHaveClass('app-meter')
  })

  test('Should sort models without recorded credits last when sorting by credits', async () => {
    const user = userEvent.setup()
    render(<ModelLeaderboardPanel models={MODELS} />)

    await user.click(screen.getByRole('button', { name: 'AI credits' }))
    await user.click(screen.getByRole('button', { name: 'AI credits' }))

    expect(
      screen.getAllByRole('rowheader').map((header) => header.textContent)
    ).toEqual(['gpt-5', 'claude-sonnet', 'gemini', 'o-series'])
  })

  test('Should sort by requests, most first, initially', () => {
    render(<ModelLeaderboardPanel models={[...MODELS].reverse()} />)

    const names = screen
      .getAllByRole('rowheader')
      .map((header) => header.textContent)
    expect(names).toEqual(['gpt-5', 'claude-sonnet', 'gemini', 'o-series'])
    expect(
      screen.getByRole('columnheader', { name: /Requests/ })
    ).toHaveAttribute('aria-sort', 'descending')
  })

  test('Should update aria-sort and order when a column header is clicked', async () => {
    const user = userEvent.setup()
    render(<ModelLeaderboardPanel models={MODELS} />)

    await user.click(screen.getByRole('button', { name: 'Requests' }))

    expect(
      screen.getByRole('columnheader', { name: /Requests/ })
    ).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getAllByRole('rowheader')[0]).toHaveTextContent('o-series')

    await user.click(screen.getByRole('button', { name: 'Requests' }))

    expect(
      screen.getByRole('columnheader', { name: /Requests/ })
    ).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getAllByRole('rowheader')[0]).toHaveTextContent('gpt-5')
  })

  test('Should show the footnote only when an other row is present', () => {
    const footnote =
      '‘other’ combines models beyond the 20-model limit per pull request.'
    const { rerender } = render(<ModelLeaderboardPanel models={MODELS} />)

    expect(screen.queryByText(footnote)).not.toBeInTheDocument()

    rerender(
      <ModelLeaderboardPanel
        models={[...MODELS, model({ model: 'other', rank: 5 })]}
      />
    )

    expect(screen.getByText(footnote)).toBeInTheDocument()
  })

  test('Should render an empty table without models', () => {
    render(<ModelLeaderboardPanel />)

    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  test('Should have no accessibility violations', async () => {
    const { container } = render(
      <ModelLeaderboardPanel
        models={[...MODELS, model({ model: 'other', rank: 5 })]}
        favourite="gpt-5"
      />
    )

    expect(await axeViolations(container)).toEqual([])
  })
})
