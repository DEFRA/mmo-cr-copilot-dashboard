import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  SonarGate,
  SonarQualityPanel,
  SonarPortfolioPanel
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

describe('#SonarGate', () => {
  test.each([
    ['passed', 'Passed'],
    ['warning', 'Warning'],
    ['failed', 'Failed'],
    ['none', 'No analysis'],
    [undefined, 'No analysis']
  ])('Should label the %s gate in text, not colour alone', (status, label) => {
    render(<SonarGate status={status} />)

    expect(screen.getByText(`Quality gate: ${label}`)).toBeInTheDocument()
  })
})

describe('#SonarQualityPanel', () => {
  test('Should show a loading state while fetching', () => {
    respond(repoMetrics)

    render(<SonarQualityPanel repository="DEFRA/repo-one" />)

    expect(screen.getByText(/Code Quality/)).toBeInTheDocument()
  })

  test('Should render the main branch metrics for a repository', async () => {
    respond(repoMetrics)

    render(<SonarQualityPanel repository="DEFRA/repo-one" />)

    expect(await screen.findByText('88.6%')).toBeInTheDocument()
    expect(screen.getByText('Quality gate: Passed')).toBeInTheDocument()
    expect(screen.getByText('Code Quality · main branch')).toBeInTheDocument()
  })

  test('Should name each rating for assistive technology', async () => {
    respond(repoMetrics)

    render(<SonarQualityPanel repository="DEFRA/repo-one" />)

    expect(
      await screen.findByLabelText('Reliability rating: A')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Security rating: B')).toBeInTheDocument()
  })

  test('Should request the pull request endpoint when given a PR number', async () => {
    respond(prMetrics)

    render(<SonarQualityPanel repository="DEFRA/repo-one" prNumber={42} />)

    await screen.findByText('Code Quality · this PR (new code)')
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/sonar/pr?repository=DEFRA%2Frepo-one&prNumber=42'
    )
  })

  test('Should explain when a pull request has not been analysed', async () => {
    respond({ ...prMetrics, analyzed: false })

    render(<SonarQualityPanel repository="DEFRA/repo-one" prNumber={42} />)

    expect(
      await screen.findByText(/hasn’t been analysed by SonarCloud/)
    ).toBeInTheDocument()
  })

  test('Should hide itself when the integration is not configured', async () => {
    respond({ configured: false })

    const { container } = render(
      <SonarQualityPanel repository="DEFRA/repo-one" />
    )

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  test('Should hide itself when the repository has no Sonar project', async () => {
    respond({ configured: true, linked: false, repository: 'DEFRA/repo-one' })

    const { container } = render(
      <SonarQualityPanel repository="DEFRA/repo-one" />
    )

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  test('Should degrade to an empty panel when SonarCloud cannot be reached', async () => {
    fetchMock.mockResponse('boom', { status: 502 })

    render(<SonarQualityPanel repository="DEFRA/repo-one" />)

    expect(await screen.findByText('No data yet')).toBeInTheDocument()
    expect(screen.getByText('Code Quality · main branch')).toBeInTheDocument()
  })

  test('Should show a dash for a metric SonarCloud did not return', async () => {
    respond({ ...repoMetrics, measures: { coverage: null } })

    render(<SonarQualityPanel repository="DEFRA/repo-one" />)

    expect((await screen.findAllByText('–')).length).toBeGreaterThan(0)
  })

  test('Should link out to the project on SonarCloud', async () => {
    respond(repoMetrics)

    render(<SonarQualityPanel repository="DEFRA/repo-one" />)

    const link = await screen.findByRole('link', { name: /View on SonarCloud/ })

    expect(link).toHaveAttribute('href', repoMetrics.url)
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('#SonarPortfolioPanel', () => {
  const overview = [
    {
      repository: 'DEFRA/repo-one',
      projectKey: 'DEFRA_repo-one',
      url: 'https://sonarcloud.io/a',
      qualityGate: 'passed'
    },
    {
      repository: 'DEFRA/repo-two',
      projectKey: 'DEFRA_repo-two',
      url: 'https://sonarcloud.io/b',
      qualityGate: 'failed'
    }
  ]

  test('Should summarise the quality gate across repositories', async () => {
    respond(overview)

    render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    const summary = await screen.findByRole('list', {
      name: 'Quality gate summary'
    })

    expect(summary).toHaveTextContent('Passed')
    expect(summary).toHaveTextContent('Failed')
  })

  test('Should omit gate statuses that no repository has', async () => {
    respond(overview)

    render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    const summary = await screen.findByRole('list', {
      name: 'Quality gate summary'
    })

    expect(summary).not.toHaveTextContent('Warning')
  })

  test('Should let a repository be opened from its chip', async () => {
    respond(overview)
    const onOpenRepo = vi.fn()

    render(<SonarPortfolioPanel onOpenRepo={onOpenRepo} />)

    await userEvent.click(
      await screen.findByRole('button', { name: /repo-one/ })
    )

    expect(onOpenRepo).toHaveBeenCalledWith('DEFRA/repo-one')
  })

  test('Should hide itself when the integration is not configured', async () => {
    respond({ configured: false })

    const { container } = render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  test('Should hide itself when no repository is linked', async () => {
    respond([])

    const { container } = render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  test('Should degrade to an empty panel when SonarCloud cannot be reached', async () => {
    fetchMock.mockResponse('boom', { status: 502 })

    render(<SonarPortfolioPanel onOpenRepo={() => {}} />)

    expect(await screen.findByText('No data yet')).toBeInTheDocument()
    expect(screen.getByText('Code Quality')).toBeInTheDocument()
  })
})
