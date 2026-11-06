import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CascadeBreadcrumbs, cascadeItems } from './CascadeBreadcrumbs.jsx'

const PROJECT = 'MMO Catch Recording'
const REPO = 'DEFRA/mmo-cr-pdf'
const labels = (nav) => cascadeItems(nav, PROJECT).map((item) => item.label)

describe('#cascadeItems', () => {
  test.each([
    [{ level: 'overview' }, []],
    [{ level: 'settings' }, []],
    [{ level: 'repo', repository: REPO }, [PROJECT, 'mmo-cr-pdf']],
    [
      { level: 'repoCycle', repository: REPO },
      [PROJECT, 'mmo-cr-pdf', 'PR coding cycle time']
    ],
    [
      { level: 'pr', repository: REPO, prNumber: 412 },
      [PROJECT, 'mmo-cr-pdf', 'Pull request 412']
    ],
    [{ level: 'contributor', contributor: 'ada' }, [PROJECT, 'ada']],
    [
      { level: 'contributor', contributor: 'ada', repository: REPO },
      [PROJECT, 'mmo-cr-pdf', 'ada']
    ],
    [{ level: 'pullRequests' }, [PROJECT, 'Pull requests']],
    [{ level: 'contributors' }, [PROJECT, 'Contributors']],
    [{ level: 'delivery' }, [PROJECT, 'Delivery']],
    [{ level: 'copilotUsage' }, [PROJECT, 'Copilot usage insights']]
  ])('Should build the cascade for %o', (nav, expected) => {
    expect(labels(nav)).toStrictEqual(expected)
  })

  test('Should encode the repository into its hash link', () => {
    const [, repo] = cascadeItems({ level: 'repo', repository: REPO }, PROJECT)

    expect(repo.href).toBe('#/repository/DEFRA%2Fmmo-cr-pdf')
  })

  test('Should keep the project in every link', () => {
    const [project, repo] = cascadeItems(
      { level: 'pr', repository: REPO, prNumber: 1, project: 'p1' },
      PROJECT
    )

    expect(project.href).toBe('#/projects/p1/overview')
    expect(repo.nav).toStrictEqual({
      level: 'repo',
      repository: REPO,
      project: 'p1'
    })
  })
})

describe('#CascadeBreadcrumbs', () => {
  test('Should render nothing on the project overview', () => {
    const { container } = render(
      <CascadeBreadcrumbs
        nav={{ level: 'overview' }}
        projectName={PROJECT}
        onNavigate={() => {}}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  test('Should mark the current page and navigate up the cascade', async () => {
    const onNavigate = vi.fn()
    render(
      <CascadeBreadcrumbs
        nav={{ level: 'pr', repository: REPO, prNumber: 412 }}
        projectName={PROJECT}
        onNavigate={onNavigate}
      />
    )

    expect(screen.getByText('Pull request 412')).toHaveAttribute(
      'aria-current',
      'page'
    )

    await userEvent.click(screen.getByRole('link', { name: 'mmo-cr-pdf' }))
    expect(onNavigate).toHaveBeenLastCalledWith({
      level: 'repo',
      repository: REPO
    })

    await userEvent.click(screen.getByRole('link', { name: PROJECT }))
    expect(onNavigate).toHaveBeenLastCalledWith({ level: 'overview' })
  })
})
