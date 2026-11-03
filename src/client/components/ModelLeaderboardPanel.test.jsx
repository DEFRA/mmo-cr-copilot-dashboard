import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { ModelLeaderboardPanel } from './ModelLeaderboardPanel.jsx'

const model = (overrides) => ({
  model: 'gpt-5',
  rank: 1,
  requests: 12000,
  requestShare: 50,
  totalTokens: 3400000,
  tokensPerRequest: 283,
  cacheHitRate: 72,
  reasoningTokens: 5000,
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
    cacheHitRate: 45,
    prCount: 30
  }),
  model({
    model: 'gemini',
    rank: 3,
    requests: 3000,
    requestShare: 12,
    cacheHitRate: 10,
    prCount: 10
  }),
  model({
    model: 'o-series',
    rank: null,
    requests: 100,
    requestShare: 1,
    tokensPerRequest: null,
    cacheHitRate: null,
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
      '3,400,000',
      '283',
      '72%High',
      '40'
    ])
  })

  test('Should show a dash for a missing tokens per request', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    const cells = within(rowFor('o-series')).getAllByRole('cell')
    expect(cells[3]).toHaveTextContent('–')
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

  test('Should leave out technical columns such as reasoning tokens', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    expect(
      screen.queryByRole('columnheader', { name: /Reasoning/ })
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(7)
  })

  test('Should stack the share value above its meter and the rate above its rating', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    const cells = within(rowFor('gpt-5')).getAllByRole('cell')
    const share = cells[1].querySelector('.app-leaderboard__stack')
    expect(share.firstElementChild).toHaveTextContent('50%')
    expect(share.lastElementChild).toHaveClass('app-meter')

    const cache = cells[4].querySelector('.app-leaderboard__stack')
    expect(cache.firstElementChild).toHaveTextContent('72%')
    expect(cache.lastElementChild).toHaveTextContent('High')
  })

  test('Should rate cache hit rate as High, Medium, Low or Not reported', () => {
    render(<ModelLeaderboardPanel models={MODELS} />)

    expect(within(rowFor('gpt-5')).getByText('High')).toBeInTheDocument()
    expect(
      within(rowFor('claude-sonnet')).getByText('Medium')
    ).toBeInTheDocument()
    expect(within(rowFor('gemini')).getByText('Low')).toBeInTheDocument()
    expect(
      within(rowFor('o-series')).getByText('Not reported')
    ).toBeInTheDocument()
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
