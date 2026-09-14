import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  buildCommit,
  buildPayloadFromCommits
} from '#/test-helpers/payload-fixture.js'
import { ContributorView } from './ContributorView'
import { OverviewView } from './OverviewView'
import { PRView } from './PRView'
import { RepoCycleTimeView } from './RepoCycleTimeView'
import { RepoView } from './RepoView'

const REPOSITORY = 'DEFRA/mmo-cr-pdf'

const payloads = [
  buildPayloadFromCommits(
    [
      buildCommit({ commit: 'a1', author: 'ada', linesAdded: 200 }),
      buildCommit({
        commit: 'g1',
        author: 'grace',
        classification: 'Human-authored',
        linesAdded: 50
      })
    ],
    {
      prNumber: 42,
      repository: REPOSITORY,
      firstCommitAt: '2026-01-12T09:00:00.000Z',
      lastCommitAt: '2026-01-13T09:00:00.000Z'
    }
  ),
  buildPayloadFromCommits(
    [buildCommit({ commit: 'b1', author: 'ada', linesAdded: 120 })],
    {
      prNumber: 43,
      repository: 'DEFRA/mmo-cr-core-infra',
      calculatedAt: '2026-01-16T10:00:00.000Z',
      firstCommitAt: '2026-01-14T09:00:00.000Z',
      lastCommitAt: '2026-01-16T09:00:00.000Z'
    }
  )
]

/** SonarCloud panels self-hide; the views render them unconditionally. */
beforeEach(() => {
  fetchMock.mockResponse(JSON.stringify({ configured: false }))
})

describe('#OverviewView', () => {
  const renderOverview = (props = {}) =>
    render(
      <OverviewView
        payloads={payloads}
        allPayloads={payloads}
        windowKey="live"
        onOpenRepo={() => {}}
        onOpenRepoCycle={() => {}}
        onOpenContributor={() => {}}
        {...props}
      />
    )

  test('Should render the portfolio headline metrics', () => {
    renderOverview()

    expect(screen.getAllByRole('table').length).toBeGreaterThan(0)
  })

  test('Should list every repository in the window', () => {
    renderOverview()

    expect(screen.getAllByText(/mmo-cr-pdf/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/mmo-cr-core-infra/).length).toBeGreaterThan(0)
  })

  test('Should list every contributor in the window', () => {
    renderOverview()

    expect(screen.getAllByText(/ada/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/grace/).length).toBeGreaterThan(0)
  })

  test('Should render without any payloads', () => {
    expect(() =>
      renderOverview({ payloads: [], allPayloads: [] })
    ).not.toThrow()
  })
})

describe('#RepoView', () => {
  const renderRepo = (props = {}) =>
    render(
      <RepoView
        payloads={payloads}
        repository={REPOSITORY}
        onOpenPR={() => {}}
        onOpenContributor={() => {}}
        {...props}
      />
    )

  test('Should show the pull requests for the repository', () => {
    renderRepo()

    expect(screen.getAllByText(/#42/).length).toBeGreaterThan(0)
  })

  test('Should not show pull requests from other repositories', () => {
    renderRepo()

    expect(screen.queryByText(/#43/)).not.toBeInTheDocument()
  })

  test('Should let a pull request be opened', async () => {
    const onOpenPR = vi.fn()
    renderRepo({ onOpenPR })

    const [trigger] = screen.getAllByRole('button', { name: /#42/ })
    await userEvent.click(trigger)

    expect(onOpenPR).toHaveBeenCalledWith(REPOSITORY, 42)
  })

  test('Should render for a repository with no pull requests', () => {
    expect(() => renderRepo({ repository: 'DEFRA/unknown' })).not.toThrow()
  })
})

describe('#RepoCycleTimeView', () => {
  const renderCycleTime = (props = {}) =>
    render(
      <RepoCycleTimeView
        payloads={payloads}
        repository={REPOSITORY}
        onOpenPR={() => {}}
        {...props}
      />
    )

  test('Should plot the cycle time for the repository', () => {
    renderCycleTime()

    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
  })

  test('Should render for a repository with no pull requests', () => {
    expect(() => renderCycleTime({ repository: 'DEFRA/unknown' })).not.toThrow()
  })
})

describe('#PRView', () => {
  const renderPr = (props = {}) =>
    render(
      <PRView
        payloads={payloads}
        repository={REPOSITORY}
        prNumber={42}
        onOpenContributor={() => {}}
        {...props}
      />
    )

  test('Should show the commits in the pull request', () => {
    renderPr()

    expect(screen.getAllByText(/a1/).length).toBeGreaterThan(0)
  })

  test('Should show the contributors to the pull request', () => {
    renderPr()

    expect(screen.getAllByText(/ada/).length).toBeGreaterThan(0)
  })

  test('Should let a contributor be opened', async () => {
    const onOpenContributor = vi.fn()
    renderPr({ onOpenContributor })

    const [trigger] = screen.getAllByRole('button', { name: /ada/ })
    await userEvent.click(trigger)

    expect(onOpenContributor).toHaveBeenCalledWith('ada')
  })

  test('Should render for a pull request that is not in the window', () => {
    expect(() => renderPr({ prNumber: 999 })).not.toThrow()
  })
})

describe('#ContributorView', () => {
  const renderContributor = (props = {}) =>
    render(
      <ContributorView
        payloads={payloads}
        contributor="ada"
        onOpenPR={() => {}}
        {...props}
      />
    )

  test('Should show the pull requests the contributor worked on', () => {
    renderContributor()

    expect(screen.getAllByText(/#42/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/#43/).length).toBeGreaterThan(0)
  })

  test('Should let a pull request be opened', async () => {
    const onOpenPR = vi.fn()
    renderContributor({ onOpenPR })

    const [trigger] = screen.getAllByRole('button', { name: /#42/ })
    await userEvent.click(trigger)

    expect(onOpenPR).toHaveBeenCalledWith(REPOSITORY, 42)
  })

  test('Should render for a contributor with no activity', () => {
    expect(() => renderContributor({ contributor: 'nobody' })).not.toThrow()
  })
})
