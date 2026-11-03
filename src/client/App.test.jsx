import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  buildCommit,
  buildPayload,
  buildPayloadFromCommits
} from '#/test-helpers/payload-fixture.js'
import { axeViolations } from '#/test-helpers/axe.js'
import { wideViewport } from '#/test-helpers/viewport.js'
import { currentSprint } from './lib/sprints'
import App from './App.jsx'

// Lazy views are dynamic imports, which are slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30000 })

const PROJECT = {
  slug: 'mmo-catch-recording',
  name: 'MMO Catch Recording',
  type: 'ai-adopted',
  role: 'dashboard-admin'
}

/**
 * The BFF as the app sees it: the caller's projects, their payload feed and
 * who they are. Everything else (SonarCloud and so on) answers "unconfigured".
 */
const backend = ({
  payloads = [],
  projects = [PROJECT],
  me = { name: 'Ada Lovelace', roles: ['Dashboard.Admin'] },
  feedDown = false,
  projectsStatus = 200
} = {}) =>
  fetchMock.mockResponse(async (request) => {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/api/me') return JSON.stringify(me)
    if (path === '/api/projects') {
      return projectsStatus === 200
        ? JSON.stringify({ projects })
        : { status: projectsStatus, body: '{}' }
    }
    if (path.startsWith('/api/sonar')) {
      return JSON.stringify({ configured: false })
    }
    if (feedDown) throw new Error('offline')
    return JSON.stringify({ payloads })
  })

// Top-level views follow the location hash, which jsdom keeps between tests.
// A wide viewport keeps the service navigation expanded.
beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.spyOn(window, 'matchMedia').mockImplementation(wideViewport)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Smoke tests for the composed dashboard. The chart internals are covered by
 * their own units; these assert that the shell renders, surfaces connection
 * state, and never blanks out when the feed is unavailable.
 */
describe('#App', () => {
  test('Should render the dashboard shell', async () => {
    backend()

    render(<App />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Project Overview' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: 'Department for Environment, Food and Rural Affairs: Copilot Delivery Insights'
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  test('Should have one main landmark and one page heading', async () => {
    backend()

    const { container } = render(<App />)

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(await axeViolations(container.ownerDocument.body)).toStrictEqual([])
  })

  test('Should title the document after the view', async () => {
    backend()

    render(<App />)

    await waitFor(() =>
      expect(document.title).toBe(
        'Project Overview – Copilot Delivery Insights'
      )
    )
  })

  test('Should show loading panels while connecting', () => {
    backend()

    render(<App />)

    expect(
      screen.getAllByRole('heading', { name: 'Loading…' }).length
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument()
  })

  test('Should tell the user when the backend cannot be reached', async () => {
    backend({ feedDown: true })

    render(<App />)

    const banner = await screen.findByRole('region', { name: 'Important' })
    expect(banner).toHaveTextContent(
      'Live updates paused: we cannot reach the analytics service.'
    )
    expect(banner).toHaveTextContent('Trying again automatically.')
    expect(banner.parentElement).toHaveAttribute('aria-live', 'polite')
  })

  test('Should keep rendering rather than blanking when the feed fails', async () => {
    backend({ feedDown: true })

    render(<App />)

    await screen.findByRole('region', { name: 'Important' })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Project Overview' })
    ).toBeInTheDocument()
  })

  test('Should mark the loading panels busy and announce them', () => {
    backend()

    const { container } = render(<App />)

    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(
      screen.getAllByRole('heading', { name: 'Loading…' }).length
    )
    expect(
      screen.getAllByRole('status').some((s) => /Loading/.test(s.textContent))
    ).toBe(true)
  })

  test('Should explain the empty dashboard when the backend is down', async () => {
    backend({ feedDown: true })

    render(<App />)

    expect(
      await screen.findByText(
        'The analytics backend is not reachable. Start the backend server to see live data.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No Data' })).toBeVisible()
  })

  test('Should clear the connection banner once the feed is live', async () => {
    backend({ payloads: [buildPayload()] })

    render(<App />)

    await waitFor(() =>
      expect(
        screen.queryAllByRole('heading', { name: 'Loading…' })
      ).toHaveLength(0)
    )
    expect(screen.queryByText(/Connecting/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Important' })
    ).not.toBeInTheDocument()
  })
})

describe('#App navigation', () => {
  const REPOSITORY = 'DEFRA/mmo-cr-pdf'

  // Views are React.lazy, so a drill-down waits on a dynamic import — too slow
  // for the default 1s query timeout when the whole suite runs in parallel.
  const LAZY_VIEW = { timeout: 10000 }

  /** Payloads must sit inside the live sprint window to be rendered. */
  const inWindow = () => {
    const { start, end } = currentSprint()
    const middle = new Date((start.getTime() + end.getTime()) / 2)
    const earlier = new Date(middle.getTime() - 24 * 60 * 60 * 1000)

    return [
      buildPayloadFromCommits(
        [
          buildCommit({ commit: 'a1', author: 'ada' }),
          buildCommit({
            commit: 'g1',
            author: 'grace',
            classification: 'Human-authored'
          })
        ],
        {
          prNumber: 42,
          repository: REPOSITORY,
          calculatedAt: middle.toISOString(),
          firstCommitAt: earlier.toISOString(),
          lastCommitAt: middle.toISOString(),
          prMergedAt: middle.toISOString()
        }
      )
    ]
  }

  const renderApp = () => {
    const payloads = inWindow()

    backend({ payloads })

    render(<App />)
  }

  const renderLive = async () => {
    renderApp()

    // The hero heading shows while projects load; wait for the project itself.
    await screen.findByRole('button', { name: /Project:/ }, LAZY_VIEW)
    return screen.findByRole(
      'heading',
      { level: 1, name: 'Project Overview' },
      LAZY_VIEW
    )
  }

  const breadcrumbLink = (name) =>
    within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
      'link',
      { name }
    )

  test('Should open on the project overview', async () => {
    await renderLive()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Project Overview' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' })
    ).not.toBeInTheDocument()
  })

  test('Should open the Copilot usage insights page from its link', async () => {
    window.history.replaceState(
      null,
      '',
      '/#/projects/mmo-catch-recording/copilot-usage'
    )
    renderApp()

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Copilot Usage Insights' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
    expect(
      await screen.findByRole(
        'heading',
        { level: 2, name: 'Model and Token Usage' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
  })

  test('Should drill into a repository and offer a way back', async () => {
    await renderLive()

    const [repoTrigger] = await screen.findAllByRole(
      'button',
      { name: /mmo-cr-pdf/ },
      LAZY_VIEW
    )
    await userEvent.click(repoTrigger)

    expect(
      await screen.findByRole('heading', { name: 'mmo-cr-pdf' }, LAZY_VIEW)
    ).toBeInTheDocument()

    await userEvent.click(breadcrumbLink('MMO Catch Recording'))

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Project Overview' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
  })

  test('Should drill from a repository into a pull request', async () => {
    await renderLive()

    const [repoTrigger] = await screen.findAllByRole(
      'button',
      { name: /mmo-cr-pdf/ },
      LAZY_VIEW
    )
    await userEvent.click(repoTrigger)

    const [prTrigger] = await screen.findAllByRole(
      'button',
      { name: /#42/ },
      LAZY_VIEW
    )
    await userEvent.click(prTrigger)

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Pull Request #42' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText(
        'Pull request 42'
      )
    ).toHaveAttribute('aria-current', 'page')

    await userEvent.click(breadcrumbLink('mmo-cr-pdf'))

    expect(
      await screen.findByRole('heading', { name: 'mmo-cr-pdf' }, LAZY_VIEW)
    ).toBeInTheDocument()
  })

  test('Should drill into a contributor', async () => {
    await renderLive()

    const [repoTrigger] = await screen.findAllByRole(
      'button',
      { name: 'mmo-cr-pdf' },
      LAZY_VIEW
    )
    await userEvent.click(repoTrigger)
    const [contributorTrigger] = await screen.findAllByRole(
      'button',
      { name: /ada/ },
      LAZY_VIEW
    )
    await userEvent.click(contributorTrigger)

    expect(
      await screen.findByRole('heading', { name: 'ada' }, LAZY_VIEW)
    ).toBeInTheDocument()
  })

  test('Should put a drill-down in the URL and go back with the browser', async () => {
    await renderLive()

    const [repoTrigger] = await screen.findAllByRole(
      'button',
      { name: /mmo-cr-pdf/ },
      LAZY_VIEW
    )
    await userEvent.click(repoTrigger)

    expect(window.location.hash).toBe(
      '#/projects/mmo-catch-recording/repository/DEFRA%2Fmmo-cr-pdf'
    )
    expect(breadcrumbLink('MMO Catch Recording')).toHaveAttribute(
      'href',
      '#/projects/mmo-catch-recording/overview'
    )

    window.history.replaceState(
      null,
      '',
      '#/projects/mmo-catch-recording/overview'
    )
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Project Overview' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
  })

  test('Should open a repository from a fully encoded hash', async () => {
    window.history.replaceState(
      null,
      '',
      '/#%2Frepository%2FDEFRA%252Fmmo-cr-pdf'
    )

    renderApp()

    expect(
      await screen.findByRole('heading', { name: 'mmo-cr-pdf' }, LAZY_VIEW)
    ).toBeInTheDocument()
  })

  test.each([
    ['Pull requests', 'Pull Requests', /#42/],
    ['Contributors', 'Contributors', /ada/]
  ])('Should list every item on the %s page', async (page, heading, item) => {
    await renderLive()

    await userEvent.click(screen.getByRole('link', { name: page }))

    expect(
      await screen.findByRole('heading', { level: 1, name: heading }, LAZY_VIEW)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: page })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(
      (await screen.findAllByRole('button', { name: item }, LAZY_VIEW)).length
    ).toBeGreaterThan(0)
  })

  test('Should say when a linked project is not available', async () => {
    window.history.replaceState(null, '', '/#/projects/unknown/overview')

    renderApp()

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'You Do Not Have Access to This Project' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(/may not exist, or your account is not in one of its/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: 'Go to the MMO Catch Recording overview'
      })
    ).toHaveAttribute('href', '#/projects/mmo-catch-recording/overview')
  })

  test('Should open Settings and return to the overview', async () => {
    await renderLive()

    const overviewLink = screen.getByRole('link', { name: 'Overview' })
    expect(overviewLink).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByRole('link', { name: 'Settings' }))

    expect(
      await screen.findByRole('heading', { name: 'Settings' }, LAZY_VIEW)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    )

    await userEvent.click(screen.getByRole('link', { name: 'Overview' }))

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Project Overview' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
  })

  test('Should follow the location hash to a top-level view', async () => {
    await renderLive()

    window.location.hash = '#/settings'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(
      await screen.findByRole('heading', { name: 'Settings' }, LAZY_VIEW)
    ).toBeInTheDocument()

    window.location.hash = '#/overview'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Project Overview' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()

    window.location.hash = '#accessibility'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(
      await screen.findByRole(
        'heading',
        {
          level: 1,
          name: 'Accessibility statement for Copilot Delivery Insights'
        },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
  })

  test('Should navigate to the accessibility statement and return to overview', async () => {
    await renderLive()

    const footerLink = screen.getByRole('link', {
      name: 'Accessibility statement'
    })
    await userEvent.click(footerLink)

    expect(
      await screen.findByRole(
        'heading',
        {
          level: 1,
          name: 'Accessibility statement for Copilot Delivery Insights'
        },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Project Overview')).not.toBeInTheDocument()

    const backLink = screen.getByRole('link', { name: 'Back' })
    await userEvent.click(backLink)

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Project Overview' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
  })

  test('Should report when nothing falls inside the selected window', async () => {
    backend({ payloads: [buildPayload()] })

    render(<App />)

    expect(
      await screen.findByText('No Data in This Time Window')
    ).toBeInTheDocument()
  })

  test('Should let the window be narrowed and returned to live', async () => {
    await renderLive()

    await userEvent.click(
      screen.getByRole('button', { name: /Previous sprints/ })
    )
    await userEvent.click(screen.getByRole('button', { name: /Custom period/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Last 24 hours' }))

    expect(
      await screen.findByText(/historical snapshot, not live/)
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Live sprint/ }))

    expect(
      screen.queryByText(/historical snapshot, not live/)
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Live sprint/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

describe('#App access by role', () => {
  const LAZY_VIEW = { timeout: 10000 }

  const openSettings = async () => {
    window.history.replaceState(null, '', '/#/settings')
    render(<App />)
    return screen.findByRole(
      'heading',
      { level: 1, name: 'Settings' },
      LAZY_VIEW
    )
  }

  test('Should show a signed-in user with no project the unauthorised page and nothing else', async () => {
    backend({
      projects: [],
      me: { name: 'Grace Hopper', roles: ['Dashboard.User'] }
    })

    const { container } = render(<App />)

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'You Do Not Have Access to This Service' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/You are signed in as Grace Hopper, but/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Sign out and use a different account' })
    ).toHaveAttribute('href', '/logout')
    expect(
      screen.queryByRole('link', { name: 'Settings' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Project:/ })).toBeNull()
    expect(await axeViolations(container.ownerDocument.body)).toStrictEqual([])
  })

  test('Should not request any payloads when the user has no project', async () => {
    backend({ projects: [], me: { name: 'G', roles: [] } })

    render(<App />)
    await screen.findByRole('heading', { level: 1 }, LAZY_VIEW)

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/payloads'))
    ).toBe(false)
  })

  test('Should invite a dashboard admin to add the first project', async () => {
    backend({ projects: [] })

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'No Projects Yet' }, LAZY_VIEW)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a project' })).toBeVisible()
    expect(
      screen.queryByText('You Do Not Have Access to This Service')
    ).not.toBeInTheDocument()
  })

  test('Should say so, rather than claim no access, when projects cannot load', async () => {
    backend({ projectsStatus: 502 })

    render(<App />)

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Projects Not Available' },
        LAZY_VIEW
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByText('You Do Not Have Access to This Service')
    ).not.toBeInTheDocument()
  })

  test('Should show a project user only the audit log in Settings', async () => {
    backend({ projects: [{ ...PROJECT, role: 'project-user' }] })

    await openSettings()

    expect(
      await screen.findByText(/You are a project user on MMO Catch Recording/)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save mapping' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeVisible()
  })

  test.each(['project-admin', 'dashboard-admin'])(
    'Should let a %s manage the project in Settings',
    async (role) => {
      backend({
        projects: [{ ...PROJECT, role }],
        me: {
          name: 'Pat',
          roles: role === 'dashboard-admin' ? ['Dashboard.Admin'] : []
        }
      })

      await openSettings()

      expect(
        await screen.findByRole('button', { name: 'Save mapping' })
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Role Mappings' }) !== null
      ).toBe(role === 'dashboard-admin')
    }
  )

  test('Should offer Manage projects only to a dashboard admin', async () => {
    backend({
      projects: [{ ...PROJECT, role: 'project-admin' }],
      me: { name: 'Pat', roles: ['Dashboard.User'] }
    })

    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Project Overview' })
    await userEvent.click(screen.getByRole('button', { name: /Project:/ }))

    expect(
      screen.queryByRole('link', { name: 'Manage projects' })
    ).not.toBeInTheDocument()
  })
})
