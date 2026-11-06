import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  buildCommit,
  buildPayloadFromCommits
} from '#/test-helpers/payload-fixture.js'
import { chartEventsFor, chartOptions } from '#/test-helpers/charts.js'

const lastHeatmap = () =>
  chartOptions().findLast((o) => o?.series?.some((s) => s.type === 'heatmap'))
import { ContributorView } from './ContributorView'
import { OverviewView } from './OverviewView'
import { PRView } from './PRView'
import { RepoCycleTimeView } from './RepoCycleTimeView'
import { RepoView } from './RepoView'
import { titleCase } from '../dashboard/KpiCard.jsx'

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

  test('Should show the Jira delivery snapshot only with a Jira key', () => {
    const jiraDelivery = { metrics: null, issues: [], status: 'loading' }
    const { unmount } = renderOverview({ jiraDelivery })
    expect(screen.queryByText('Measured to Jira Done')).toBeNull()
    expect(screen.queryByText(/no Jira project key/)).toBeNull()
    unmount()

    renderOverview({ jiraDelivery, jiraConnected: true })
    expect(screen.getByText('Measured to Jira Done')).toBeInTheDocument()
  })

  test('Should tell only a project admin why the Jira snapshot is hidden', () => {
    renderOverview({ canAdminister: true })

    expect(
      screen.getByText(
        'Jira delivery metrics are hidden because this project has no Jira project key.'
      )
    ).toBeInTheDocument()
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

  test('Should render the Copilot usage subsection and panel', () => {
    renderOverview({ insightsHref: '#/projects/p/copilot-usage' })

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'GitHub Copilot Usage Metrics'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Model level, never per person')
    ).toBeInTheDocument()
  })

  test('Should render without any payloads', () => {
    expect(() =>
      renderOverview({ payloads: [], allPayloads: [] })
    ).not.toThrow()
  })

  test('Should render the project and repository scopes', () => {
    renderOverview()

    expect(
      screen.getByRole('heading', { level: 2, name: 'Key Metrics' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Repositories' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', {
        name: 'Repository comparison for the selected period'
      })
    ).toBeInTheDocument()
  })

  test('Should name every KPI as in docs/metrics.md', () => {
    renderOverview()

    for (const label of [
      'Copilot adoption',
      'Commit assist rate',
      'Line assist rate',
      'Copilot Leverage',
      'PR coding cycle time',
      'PR rework ratio',
      'Average batch size',
      'Net lines delivered'
    ]) {
      expect(
        screen.getByRole('button', {
          name: `${titleCase(label)}, show breakdown by repository`
        })
      ).toHaveAttribute('aria-expanded', 'false')
    }
  })

  test('Should open one drill panel with a metric definition link', async () => {
    const onOpenRepo = vi.fn()
    renderOverview({ onOpenRepo })

    const card = screen.getByRole('button', { name: /^Commit Assist Rate,/ })
    await userEvent.click(card)

    expect(card).toHaveAttribute('aria-expanded', 'true')
    const drill = screen.getByRole('region', {
      name: 'Commit Assist Rate by Repository'
    })
    expect(
      within(drill).getByRole('link', { name: /Metric definition/ })
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/docs\/metrics\.md#metric-copilot-assist-rate$/)
    )

    await userEvent.click(
      within(drill).getByRole('button', { name: 'mmo-cr-pdf' })
    )
    expect(onOpenRepo).toHaveBeenCalledWith(REPOSITORY)

    await userEvent.click(card)
    expect(
      screen.queryByRole('region', { name: 'Commit Assist Rate by Repository' })
    ).not.toBeInTheDocument()
  })

  test('Should drill from PR coding cycle time to the repository cycle times', async () => {
    const onOpenRepoCycle = vi.fn()
    renderOverview({ onOpenRepoCycle })

    await userEvent.click(
      screen.getByRole('button', { name: /^PR Coding Cycle Time,/ })
    )
    const drill = screen.getByRole('region', {
      name: 'PR Coding Cycle Time by Repository'
    })
    await userEvent.click(
      within(drill).getByRole('button', { name: /^mmo-cr-pdf/ })
    )

    expect(onOpenRepoCycle).toHaveBeenCalledWith(REPOSITORY)
  })

  test('Should replace the open drill panel when another KPI is chosen', async () => {
    renderOverview()

    await userEvent.click(
      screen.getByRole('button', { name: /^Copilot Adoption,/ })
    )
    await userEvent.click(
      screen.getByRole('button', { name: /^Net Lines Delivered,/ })
    )

    expect(
      screen.queryByRole('region', { name: 'Copilot Adoption by Repository' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Net Lines Delivered by Repository' })
    ).toBeInTheDocument()
  })

  test('Should open a repository from the comparison table', async () => {
    const onOpenRepo = vi.fn()
    renderOverview({ onOpenRepo })

    const table = screen.getByRole('table', {
      name: 'Repository comparison for the selected period'
    })
    await userEvent.click(
      within(table).getByRole('button', { name: 'mmo-cr-pdf' })
    )

    expect(onOpenRepo).toHaveBeenCalledWith(REPOSITORY)
  })

  test('Should drill from the chart category selectors', async () => {
    const onOpenRepo = vi.fn()
    renderOverview({ onOpenRepo })

    const repoFigure = screen.getByRole('figure', {
      name: 'Commit Assist Rate by Repository'
    })
    expect(
      within(repoFigure).queryAllByRole('button', { name: /mmo-cr-pdf/ })
    ).toHaveLength(0)

    const table = screen.getByRole('table', {
      name: 'Repository comparison for the selected period'
    })
    await userEvent.click(
      within(table).getByRole('button', { name: 'mmo-cr-pdf' })
    )
    expect(onOpenRepo).toHaveBeenCalledWith(REPOSITORY)
  })

  test('Should keep each data table outside the chart image', () => {
    renderOverview()

    for (const img of screen.getAllByRole('img')) {
      expect(img.querySelector('table')).toBeNull()
    }
    expect(
      screen.getByRole('table', {
        name: 'Figure 4: Commit Assist Rate by Repository'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Download the data for figure 1 (CSV)')
    ).toBeInTheDocument()
  })

  test('Should show only the mapped personas', () => {
    renderOverview({ mappingsByHandle: { grace: 'qa' } })

    const personas = screen.getByRole('region', { name: 'Personas' })
    expect(
      within(personas)
        .getAllByRole('heading', { level: 4 })
        .map((h) => h.textContent)
    ).toEqual(['Developers', 'DevOps Engineers', 'QA Engineers'])
    expect(screen.queryByText(/unmapped/i)).not.toBeInTheDocument()
    expect(
      within(personas).getByText(
        'No activity from this role in the selected period.'
      )
    ).toBeInTheDocument()
  })

  test.each([
    ['loading', /^Loading (Developers|DevOps Engineers|QA Engineers)$/],
    ['error', /could not load the persona mappings/]
  ])('Should render the %s persona state', (personaStatus, text) => {
    renderOverview({ personaStatus })

    const personas = screen.getByRole('region', { name: 'Personas' })
    expect(within(personas).getAllByText(text)).toHaveLength(3)
  })

  test('Should open a contributor in a repository from a heatmap cell', () => {
    const onOpenContributor = vi.fn()
    renderOverview({ onOpenContributor })

    const { click } = chartEventsFor('heatmap')
    click({ componentType: 'series', data: { value: [0, 0, '-'] } })
    expect(onOpenContributor).not.toHaveBeenCalled()

    const heatmap = lastHeatmap()
    const x = heatmap.xAxis.data.indexOf('mmo-cr-pdf')
    const y = heatmap.yAxis.data.indexOf('ada')
    click({ componentType: 'series', data: { value: [x, y, 100] } })

    expect(onOpenContributor).toHaveBeenCalledWith('ada', REPOSITORY)
  })

  test('Should render empty states without any payloads', () => {
    renderOverview({ payloads: [], allPayloads: [] })

    expect(
      screen.getAllByText('No data for this period').length
    ).toBeGreaterThanOrEqual(8)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
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
    renderRepo({ repository: 'DEFRA/unknown' })

    expect(
      screen.getByRole('heading', { level: 2, name: 'Repository Overview' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'No pull requests for this repository in the selected period.'
      )
    ).toBeInTheDocument()
  })

  test('Should render the repository and pull request scopes', () => {
    renderRepo()

    expect(
      screen.getByRole('heading', { level: 2, name: 'Repository Overview' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Pull Requests' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/mmo-cr-pdf · 2 contributors · 1 pull request/)
    ).toBeInTheDocument()
  })

  test('Should name every KPI as in docs/metrics.md', () => {
    renderRepo()

    for (const label of [
      'Copilot adoption',
      'Commit assist rate',
      'Line assist rate',
      'Copilot Leverage',
      'PR coding cycle time',
      'PR rework ratio',
      'Average batch size',
      'Net lines delivered'
    ]) {
      expect(
        screen.getByRole('button', {
          name: `${titleCase(label)}, show breakdown by pull request`
        })
      ).toHaveAttribute('aria-expanded', 'false')
    }
  })

  test.each([
    ['Copilot adoption', '1 of 2 contributors'],
    ['Commit assist rate', '50%'],
    ['Line assist rate', /%$/],
    ['Copilot Leverage', 'Copilot-led'],
    ['PR coding cycle time', '1d'],
    ['PR rework ratio', /^\d/],
    ['Average batch size', /lines$/],
    ['Net lines delivered', /^\d/]
  ])('Should drill %s down to each pull request', async (label, value) => {
    const onOpenPR = vi.fn()
    renderRepo({ onOpenPR })

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${titleCase(label)},`) })
    )
    const drill = screen.getByRole('region', {
      name: /by Pull Request$/
    })
    expect(
      within(drill).getByRole('link', { name: /Metric definition/ })
    ).toBeInTheDocument()
    expect(
      within(drill)
        .getAllByText(value)
        .some((el) => el.classList.contains('app-drill__value'))
    ).toBe(true)

    await userEvent.click(within(drill).getByRole('button', { name: '#42' }))
    expect(onOpenPR).toHaveBeenCalledWith(REPOSITORY, 42)
  })

  test('Should list pull requests in a sortable table with status and Jira', async () => {
    const onOpenPR = vi.fn()
    renderRepo({
      onOpenPR,
      jiraConnected: true,
      payloads: [
        ...payloads,
        buildPayloadFromCommits([buildCommit({ commit: 'c1' })], {
          prNumber: 44,
          repository: REPOSITORY,
          prTitle: 'Add landing dates',
          jiraKeys: ['MMO-9'],
          prMergedAt: null,
          calculatedAt: '2026-01-20T10:00:00.000Z'
        })
      ]
    })

    const table = screen.getByRole('table', {
      name: /Pull requests in mmo-cr-pdf/
    })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Open')).toHaveClass('govuk-tag--blue')
    expect(within(rows[0]).getByText('MMO-9')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Merged')).toHaveClass('govuk-tag--green')
    expect(within(rows[1]).getByText('No Jira key')).toBeInTheDocument()

    await userEvent.click(
      within(table).getByRole('button', { name: /Pull request/ })
    )
    expect(
      within(within(table).getAllByRole('row')[1]).getByText('#42')
    ).toBeInTheDocument()

    await userEvent.click(
      within(table).getByRole('button', { name: '#44 Add landing dates' })
    )
    expect(onOpenPR).toHaveBeenCalledWith(REPOSITORY, 44)
  })

  test('Should leave out the Jira column when the project has no Jira key', () => {
    renderRepo()

    const table = screen.getByRole('table', {
      name: /Pull requests in mmo-cr-pdf/
    })
    expect(
      within(table).queryByRole('columnheader', { name: 'Jira' })
    ).toBeNull()
    expect(within(table).queryByText('No Jira key')).toBeNull()
  })

  test('Should put every chart in a figure with its data table', () => {
    renderRepo()

    for (const title of [
      'Coding Cycle Time by PR',
      'Lines Added and Deleted per Commit',
      'Batch Size by PR',
      'Commit Composition',
      'Line Composition',
      'Commit Assist Rate by Pull Request',
      'Commits per PR by Classification',
      'Commit Assist Rate by Contributor'
    ]) {
      expect(screen.getByRole('figure', { name: title })).toBeInTheDocument()
    }
    expect(
      screen.getByText('Download the data for figure 8 (CSV)')
    ).toBeInTheDocument()
  })

  test('Should drill from the chart category selectors', async () => {
    const onOpenPR = vi.fn()
    const onOpenContributor = vi.fn()
    renderRepo({ onOpenPR, onOpenContributor })

    const prFigure = screen.getByRole('figure', {
      name: 'Commit Assist Rate by Pull Request'
    })
    await userEvent.click(within(prFigure).getByRole('button', { name: /#42/ }))
    const contributorFigure = screen.getByRole('figure', {
      name: 'Commit Assist Rate by Contributor'
    })
    await userEvent.click(
      within(contributorFigure).getByRole('button', { name: /grace/ })
    )

    expect(onOpenPR).toHaveBeenCalledWith(REPOSITORY, 42)
    expect(onOpenContributor).toHaveBeenCalledWith('grace', REPOSITORY)
  })

  test('Should show the SonarCloud panel as not available when unlinked', async () => {
    renderRepo()

    const quality = screen.getByRole('region', { name: 'Code Quality' })
    expect(
      await within(quality).findByText('Not available yet')
    ).toBeInTheDocument()
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
    expect(
      screen.getByRole('heading', { level: 2, name: 'PR Coding Cycle Time' })
    ).toBeInTheDocument()
  })

  test('Should name the summary cards after the metric', () => {
    renderCycleTime()

    for (const label of [
      'PR coding cycle time',
      'Median PR coding cycle time',
      'Fastest PR coding cycle time',
      'Slowest PR coding cycle time'
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: titleCase(label) })
      ).toBeInTheDocument()
    }
    expect(
      screen.getByRole('link', { name: 'PR coding cycle time definition' })
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/#metric-pr-coding-cycle-time$/)
    )
  })

  test('Should give each chart a data table', () => {
    renderCycleTime()

    expect(
      screen.getByRole('table', {
        name: 'Figure 1: Coding Cycle Time by Merge Date'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', {
        name: 'Figure 2: Coding Cycle Time by PR'
      })
    ).toBeInTheDocument()
  })

  test('Should open a pull request from the ranking', async () => {
    const onOpenPR = vi.fn()
    renderCycleTime({ onOpenPR })

    const figure = screen.getByRole('figure', {
      name: 'Coding Cycle Time by PR'
    })
    await userEvent.click(within(figure).getByRole('button', { name: /#42/ }))

    expect(onOpenPR).toHaveBeenCalledWith(REPOSITORY, 42)
  })

  test('Should render an empty state for a repository with no pull requests', () => {
    renderCycleTime({ repository: 'DEFRA/unknown' })

    expect(screen.getByText('No data for this period')).toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
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
        canReclassify
        {...props}
      />
    )

  test('Should show the commits in the pull request', () => {
    renderPr()

    expect(screen.getAllByText(/a1/).length).toBeGreaterThan(0)
  })

  test('Should offer linked Jira tickets only when the project has a Jira key', () => {
    fetchMock.mockResponse(JSON.stringify({ links: [] }))
    const { unmount } = renderPr({ projectSlug: 'ALPH' })
    expect(
      screen.queryByRole('heading', { name: /Linked Jira Tickets/i })
    ).toBeNull()
    unmount()

    renderPr({ projectSlug: 'ALPH', jiraConnected: true })
    expect(
      screen.getByRole('heading', { name: /Linked Jira Tickets/i })
    ).toBeInTheDocument()
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
    renderPr({ prNumber: 999 })

    expect(
      screen.getByRole('heading', { level: 2, name: 'Pull Request Overview' })
    ).toBeInTheDocument()
    expect(screen.getByText('No data for this period')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('Should render the pull request and commit scopes with KPIs', () => {
    renderPr()

    expect(
      screen.getByRole('heading', { level: 2, name: 'Pull Request Overview' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Commits' })
    ).toBeInTheDocument()
    for (const label of [
      'Commit assist rate',
      'Line assist rate',
      'Lines touched',
      'PR coding cycle time'
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: titleCase(label) })
      ).toBeInTheDocument()
    }
    expect(screen.getByText('Merged', { selector: '.govuk-tag' })).toHaveClass(
      'govuk-tag--green'
    )
    expect(
      screen.getAllByText(/Data and description/).length
    ).toBeGreaterThanOrEqual(5)
    expect(document.querySelector('[class*="grid-cols"]')).toBeNull()
  })

  test('Should show the commit log with classification badges', () => {
    renderPr()
    const log = within(screen.getByRole('region', { name: 'Commit Log' }))

    expect(log.getByText('Copilot-assisted')).toHaveClass('app-badge--copilot')
    expect(log.getByText('Human-authored')).toHaveClass('app-badge--human')
  })

  test('Should offer re-classification without an admin only tag', () => {
    renderPr()

    expect(screen.queryByText('Admin only')).not.toBeInTheDocument()
    expect(
      screen.getByText(/Merged: classification can be corrected/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Edit classification for commit a1' })
    ).toBeInTheDocument()
  })

  test('Should show only the badge when re-classification is not allowed', () => {
    renderPr({ canReclassify: false })

    expect(
      screen.queryByRole('columnheader', { name: /Correct it/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Admin only')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit classification/ })
    ).not.toBeInTheDocument()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  test('Should keep an open pull request read-only', () => {
    const open = payloads.map((p) => ({ ...p, prMergedAt: undefined }))
    renderPr({ payloads: open })

    expect(screen.getByText('Open')).toHaveClass('govuk-tag--blue')
    expect(
      screen.queryByRole('button', { name: /Edit classification/ })
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('Once merged').length).toBeGreaterThan(0)
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

  test('Should show only one repository when scoped to it', () => {
    renderContributor({ repository: REPOSITORY })

    expect(screen.getByText(/^ada in mmo-cr-pdf/)).toBeInTheDocument()
    expect(screen.getAllByText(/#42/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/#43/)).not.toBeInTheDocument()
  })

  test('Should show the KPI cards named as in docs/metrics.md', () => {
    renderContributor()

    for (const label of [
      'Commit assist rate',
      'Line assist rate',
      'Repositories',
      'Net lines delivered'
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: titleCase(label) })
      ).toBeInTheDocument()
    }
  })

  test('Should give every chart a generic title and a data table', () => {
    renderContributor()

    for (const title of [
      'Commit composition',
      'Line composition',
      'Commit assist rate by pull request',
      'Commits per PR by Classification',
      'Lines Added and Deleted per Commit'
    ]) {
      expect(
        screen.getByRole('table', {
          name: new RegExp(`Figure \\d: ${title}$`, 'i')
        })
      ).toBeInTheDocument()
    }
    expect(screen.getAllByText('Data and description')).toHaveLength(5)
  })

  test('Should avoid league-table language', () => {
    const { container } = renderContributor()

    expect(container.textContent).not.toMatch(
      /\b(rank|highest|lowest|top|leader)/i
    )
  })

  test('Should list the pull request history in a sortable table', async () => {
    renderContributor()

    const table = screen.getByRole('table', {
      name: /Pull requests with commits from ada/
    })
    const rows = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).getAllByRole('cell')[0].textContent)

    expect(rows()).toEqual(['mmo-cr-core-infra', 'mmo-cr-pdf'])

    await userEvent.click(
      within(table).getByRole('button', { name: 'Repository' })
    )
    expect(rows()).toEqual(['mmo-cr-core-infra', 'mmo-cr-pdf'])
    await userEvent.click(
      within(table).getByRole('button', { name: 'Repository' })
    )
    expect(rows()).toEqual(['mmo-cr-pdf', 'mmo-cr-core-infra'])
  })

  test('Should let a pull request be opened from the history', async () => {
    const onOpenPR = vi.fn()
    renderContributor({ onOpenPR })

    await userEvent.click(
      screen.getByRole('button', { name: /^#42\s?in mmo-cr-pdf$/ })
    )

    expect(onOpenPR).toHaveBeenCalledWith(REPOSITORY, 42)
  })

  test('Should render the empty state for a contributor with no activity', () => {
    renderContributor({ contributor: 'nobody' })

    expect(
      screen.getByRole('heading', { name: 'Contributor Overview' })
    ).toBeInTheDocument()
    expect(screen.getByText('No data for this period')).toBeInTheDocument()
  })
})
