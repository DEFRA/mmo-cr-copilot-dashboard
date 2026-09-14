import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  buildCommit,
  buildPayload,
  buildPayloadFromCommits
} from '#/test-helpers/payload-fixture.js'
import { currentSprint } from './lib/sprints'
import App from './App.jsx'

/**
 * Smoke tests for the composed dashboard. The chart internals are covered by
 * their own units; these assert that the shell renders, surfaces connection
 * state, and never blanks out when the feed is unavailable.
 */
describe('#App', () => {
  test('Should render the dashboard shell', async () => {
    fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

    render(<App />)

    expect(
      await screen.findByRole('heading', {
        name: 'MMO Catch Recording Code Delivery Insights'
      })
    ).toBeInTheDocument()
  })

  test('Should announce the connection state while connecting', () => {
    fetchMock.mockResponse(JSON.stringify({ payloads: [] }))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Connecting')
  })

  test('Should tell the user when the backend cannot be reached', async () => {
    fetchMock.mockReject(new Error('offline'))

    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Unable to reach backend'
      )
    )
  })

  test('Should keep rendering rather than blanking when the feed fails', async () => {
    fetchMock.mockReject(new Error('offline'))

    render(<App />)

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(
      screen.getByRole('heading', {
        name: 'MMO Catch Recording Code Delivery Insights'
      })
    ).toBeInTheDocument()
  })

  test('Should clear the connection banner once the feed is live', async () => {
    fetchMock.mockResponse(JSON.stringify({ payloads: [buildPayload()] }))

    render(<App />)

    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    )
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

  const renderLive = async () => {
    const payloads = inWindow()

    // SonarCloud is unconfigured here; its panels self-hide.
    fetchMock.mockResponse((request) =>
      request.url.includes('/api/sonar')
        ? JSON.stringify({ configured: false })
        : JSON.stringify({ payloads })
    )

    render(<App />)

    return screen.findByRole('heading', { name: 'Global Overview' }, LAZY_VIEW)
  }

  test('Should open on the global overview', async () => {
    await renderLive()

    expect(
      screen.getByRole('heading', { name: 'Global Overview' })
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

    await userEvent.click(
      screen.getByRole('button', { name: 'All Repositories' })
    )

    expect(
      await screen.findByRole('heading', { name: 'Global Overview' }, LAZY_VIEW)
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
  })

  test('Should drill into a contributor', async () => {
    await renderLive()

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

  test('Should open Settings and return to the overview', async () => {
    await renderLive()

    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }))

    expect(
      await screen.findByRole('heading', { name: 'Settings' }, LAZY_VIEW)
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'All Repositories' })
    )

    expect(
      await screen.findByRole('heading', { name: 'Global Overview' }, LAZY_VIEW)
    ).toBeInTheDocument()
  })

  test('Should report when nothing falls inside the selected window', async () => {
    fetchMock.mockResponse(JSON.stringify({ payloads: [buildPayload()] }))

    render(<App />)

    expect(
      await screen.findByText('No data in this time window')
    ).toBeInTheDocument()
  })

  test('Should let the window be narrowed and returned to live', async () => {
    await renderLive()

    await userEvent.click(screen.getByRole('button', { name: /Sprint ·/ }))
    await userEvent.click(screen.getByRole('button', { name: /Last 24 hours/ }))

    expect(
      await screen.findByText(/historical snapshot, not live/)
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Return to live' })
    )

    expect(
      screen.queryByText(/historical snapshot, not live/)
    ).not.toBeInTheDocument()
  })
})
