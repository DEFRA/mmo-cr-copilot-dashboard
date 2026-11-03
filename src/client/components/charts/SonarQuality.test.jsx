import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { chartOptions } from '#/test-helpers/charts.js'
import {
  SonarQualityGatePanel,
  SonarPortfolioPanel,
  SonarSprintTrend,
  asAtCaption
} from './SonarQuality'

const repoMetrics = {
  configured: true,
  repository: 'DEFRA/repo-one',
  projectKey: 'DEFRA_repo-one',
  url: 'https://sonarcloud.io/project/overview?id=DEFRA_repo-one',
  qualityGate: 'passed',
  ratings: { reliability: 'A', security: 'B', maintainability: 'C' },
  measures: {
    coverage: 88.55,
    bugs: 2,
    vulnerabilities: 0,
    code_smells: 17,
    duplicated_lines_density: 1.2,
    security_hotspots: 3
  }
}

const prMetrics = {
  ...repoMetrics,
  prNumber: 42,
  analyzed: true,
  measures: { new_coverage: 91, new_bugs: 0 }
}

const respond = (body) => fetchMock.mockResponse(JSON.stringify(body))

describe('#SonarQualityGatePanel', () => {
  test('Should show a loading state while fetching', () => {
    respond(repoMetrics)

    render(<SonarQualityGatePanel repository="DEFRA/repo-one" />)

    expect(screen.getByText('Loading Quality Gate')).toBeInTheDocument()
  })

  test('Should show the gate, ratings and measures for a linked repository', async () => {
    respond({ ...repoMetrics, qualityGate: 'failed' })

    render(<SonarQualityGatePanel repository="DEFRA/repo-one" />)

    expect(await screen.findByText('Failed')).toHaveClass('govuk-tag--red')
    expect(screen.getByText('Reliability rating A')).toBeInTheDocument()
    expect(screen.getByText('88.6%')).toBeInTheDocument()
    expect(screen.getByText('Code smells').nextSibling).toHaveTextContent('17')
    expect(
      screen.getByRole('link', {
        name: 'View on SonarCloud (opens in new tab)'
      })
    ).toHaveAttribute('rel', 'noopener noreferrer')
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/sonar/repo?repository=DEFRA%2Frepo-one'
    )
  })

  test('Should label an unknown gate as no analysis', async () => {
    respond({ ...repoMetrics, qualityGate: 'mystery', measures: {} })

    render(<SonarQualityGatePanel repository="DEFRA/repo-one" />)

    expect(await screen.findByText('No analysis')).toHaveClass(
      'govuk-tag--grey'
    )
    expect(screen.getAllByText('–').length).toBeGreaterThan(0)
  })

  test.each([
    ['not configured', { configured: false }],
    ['not linked', { configured: true, linked: false }]
  ])('Should show the empty state when %s', async (_label, body) => {
    respond(body)

    render(<SonarQualityGatePanel repository="DEFRA/repo-one" />)

    expect(await screen.findByText('Not available yet')).toBeInTheDocument()
  })

  test('Should show the error state when SonarCloud cannot be reached', async () => {
    fetchMock.mockResponse('boom', { status: 502 })

    render(<SonarQualityGatePanel repository="DEFRA/repo-one" />)

    expect(
      await screen.findByText(/could not load SonarCloud data/)
    ).toBeInTheDocument()
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  test('Should show new code measures for a pull request', async () => {
    respond(prMetrics)

    render(<SonarQualityGatePanel repository="DEFRA/repo-one" prNumber={42} />)

    expect(await screen.findByText('Passed')).toHaveClass('govuk-tag--green')
    expect(
      screen.getByRole('heading', { name: 'Code Quality on New Code' })
    ).toBeInTheDocument()
    expect(screen.getByText('Security rating B')).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/sonar/pr?repository=DEFRA%2Frepo-one&prNumber=42'
    )
  })

  test('Should show the empty state for an unanalysed pull request', async () => {
    respond({ ...prMetrics, analyzed: false })

    render(<SonarQualityGatePanel repository="DEFRA/repo-one" prNumber={42} />)

    expect(
      await screen.findByText(/has not been analysed by SonarCloud/)
    ).toBeInTheDocument()
  })
})

describe('#SonarQualityGatePanel as at a past sprint', () => {
  test('Should ask for the cut-off and caption the analysis date', async () => {
    respond({
      ...repoMetrics,
      asOf: '2026-01-21T23:59:59.000Z',
      analysisDate: '2026-01-20T10:15:00.000Z'
    })

    render(
      <SonarQualityGatePanel
        repository="DEFRA/repo-one"
        asOf="2026-01-21T23:59:59.000Z"
      />
    )

    expect(await screen.findByText('As at 21 Jan 2026')).toHaveClass(
      'app-mini-tag'
    )
    expect(
      screen.getByText('Last analysis 20 January 2026')
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/sonar/repo?repository=DEFRA%2Frepo-one&asOf=2026-01-21T23%3A59%3A59.000Z'
    )
  })

  test('Should say when nothing was analysed before the cut-off', async () => {
    respond({
      ...repoMetrics,
      asOf: '2026-01-21T23:59:59.000Z',
      analysisDate: null
    })

    render(
      <SonarQualityGatePanel
        repository="DEFRA/repo-one"
        asOf="2026-01-21T23:59:59.000Z"
      />
    )

    expect(
      await screen.findByText('No SonarCloud analysis before 21 January 2026.')
    ).toBeInTheDocument()
  })
})

describe('#asAtCaption', () => {
  test('Should be empty for the live sprint', () => {
    expect(asAtCaption(undefined, '2026-01-20T00:00:00Z')).toBeNull()
  })

  test('Should give a compact date for a past cut-off', () => {
    expect(asAtCaption('2026-01-21T12:00:00Z')).toBe('As at 21 Jan 2026')
  })
})

describe('#SonarPortfolioPanel', () => {
  const overview = [
    {
      repository: 'DEFRA/repo-one',
      projectKey: 'DEFRA_repo-one',
      url: 'https://sonarcloud.io/a',
      qualityGate: 'passed',
      measures: { coverage: 88.4, bugs: 0, vulnerabilities: 1 }
    },
    {
      repository: 'DEFRA/repo-two',
      projectKey: 'DEFRA_repo-two',
      url: 'https://sonarcloud.io/b',
      qualityGate: 'failed',
      measures: { coverage: null, bugs: 2, vulnerabilities: 0 }
    }
  ]

  test('Should show a card per repository with its gate and headline measures', async () => {
    respond(overview)

    render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    expect(
      await screen.findByRole('heading', {
        name: 'Code Quality Across Repositories'
      })
    ).toBeInTheDocument()
    const passed = screen.getByRole('article', { name: /^repo-one/ })
    expect(passed).toHaveClass('app-gate--passed')
    expect(within(passed).getByText('Passed')).toBeInTheDocument()
    expect(passed).toHaveTextContent('Coverage88.4%')
    expect(passed).toHaveTextContent('Bugs0')
    expect(passed).toHaveTextContent('Vulnerabilities1')

    const failed = screen.getByRole('article', { name: /^repo-two/ })
    expect(failed).toHaveClass('app-gate--failed')
    expect(within(failed).getByText('Failed')).toBeInTheDocument()
    expect(failed).toHaveTextContent('Coverage–')
    expect(screen.queryByText(/\d+ Passed/)).not.toBeInTheDocument()
  })

  test('Should let a repository be opened from its card', async () => {
    respond(overview)
    const onOpenRepo = vi.fn()

    render(<SonarPortfolioPanel onOpenRepo={onOpenRepo} />)

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'repo-one, quality gate passed, open repository'
      })
    )
    expect(onOpenRepo).toHaveBeenCalledWith('DEFRA/repo-one')
  })

  test('Should pass the cut-off for a past sprint', async () => {
    respond(
      overview.map((r) => ({
        ...r,
        asOf: '2026-01-21T23:59:59.000Z',
        analysisDate: '2026-01-19T00:00:00.000Z'
      }))
    )

    render(
      <SonarPortfolioPanel
        onOpenRepo={() => {}}
        asOf="2026-01-21T23:59:59.000Z"
      />
    )

    expect(await screen.findByText('As at 21 Jan 2026')).toBeInTheDocument()
    expect(
      screen.getByText('Latest analysis 19 January 2026')
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/sonar/overview?asOf=2026-01-21T23%3A59%3A59.000Z'
    )
  })

  test.each([
    ['not configured', { configured: false }],
    ['no repository is linked', []]
  ])('Should hide itself when %s', async (_, body) => {
    respond(body)

    const { container } = render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  test('Should show the error state when SonarCloud cannot be reached', async () => {
    fetchMock.mockResponse('boom', { status: 502 })

    render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    expect(
      await screen.findByText(/could not load SonarCloud data/)
    ).toBeInTheDocument()
  })
})

describe('#SonarSprintTrend', () => {
  const sprints = [
    {
      start: new Date('2026-07-22T00:00:00Z'),
      end: new Date('2026-08-05T00:00:00Z')
    },
    {
      start: new Date('2026-07-08T00:00:00Z'),
      end: new Date('2026-07-22T00:00:00Z')
    }
  ]

  test('Should plot the share passing at each sprint end, oldest first', async () => {
    fetchMock.mockResponse((req) =>
      JSON.stringify(
        req.url.includes('2026-07-21')
          ? [
              { repository: 'a', qualityGate: 'passed' },
              { repository: 'b', qualityGate: 'failed' }
            ]
          : [
              { repository: 'a', qualityGate: 'passed' },
              { repository: 'b', qualityGate: 'passed' }
            ]
      )
    )

    render(<SonarSprintTrend sprints={sprints} number={7} />)

    expect(
      await screen.findByRole('table', {
        name: 'Figure 7: Repositories Passing the Quality Gate by Sprint'
      })
    ).toBeInTheDocument()
    const line = chartOptions().findLast((o) => o?.series?.[0]?.type === 'line')
    expect(line.series[0].data).toEqual([50, 100])
    expect(fetchMock.mock.calls[0][0]).toContain(
      'asOf=2026-07-21T23%3A59%3A59.000Z'
    )
  })

  test('Should hide itself when SonarCloud is not configured', async () => {
    respond({ configured: false })

    const { container } = render(
      <SonarSprintTrend sprints={sprints} number={7} />
    )

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
