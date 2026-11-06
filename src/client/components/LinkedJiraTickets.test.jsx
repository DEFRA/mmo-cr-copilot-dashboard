import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LinkedJiraTickets } from './LinkedJiraTickets.jsx'

const PATH = '/api/projects/mmo-cr/pr-links/DEFRA%2Frepo/42'

const renderTickets = (props = {}) =>
  render(
    <LinkedJiraTickets
      projectSlug="mmo-cr"
      repository="DEFRA/repo"
      prNumber={42}
      payloadKeys={['MMO-1']}
      {...props}
    />
  )

describe('#LinkedJiraTickets', () => {
  beforeEach(() => {
    fetchMock.mockResponse((req) =>
      req.method === 'PUT'
        ? JSON.stringify({
            links: [
              { jiraKey: 'MMO-1', source: 'payload' },
              { jiraKey: 'MMO-9', source: 'manual' }
            ]
          })
        : JSON.stringify({
            links: [
              { jiraKey: 'MMO-1', source: 'payload' },
              { jiraKey: 'MMO-5', source: 'manual' }
            ]
          })
    )
  })

  test('Should list the found and the admin-added tickets', async () => {
    renderTickets()

    expect(await screen.findByText('MMO-5')).toBeInTheDocument()
    expect(screen.getByText('MMO-1')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe(PATH)
  })

  test('Should hide the change control from non-admins', async () => {
    renderTickets()

    await screen.findByText('MMO-5')
    expect(
      screen.queryByRole('button', { name: 'Change links' })
    ).not.toBeInTheDocument()
  })

  test('Should save the admin links with the CSRF header', async () => {
    const user = userEvent.setup()
    renderTickets({ canEdit: true })
    await screen.findByText('MMO-5')

    await user.click(screen.getByRole('button', { name: 'Change links' }))
    const input = screen.getByLabelText('Jira tickets added by an admin')
    expect(input).toHaveValue('MMO-5')
    await user.clear(input)
    await user.type(input, 'mmo-9')
    await user.click(screen.getByRole('button', { name: 'Save links' }))

    await waitFor(() => expect(screen.getByText('MMO-9')).toBeInTheDocument())
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(put[0]).toBe(PATH)
    expect(put[1].headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(JSON.parse(put[1].body)).toEqual({ jiraKeys: ['MMO-9'] })
  })

  test('Should explain a malformed key without saving', async () => {
    const user = userEvent.setup()
    renderTickets({ canEdit: true })
    await screen.findByText('MMO-5')

    await user.click(screen.getByRole('button', { name: 'Change links' }))
    const input = screen.getByLabelText('Jira tickets added by an admin')
    await user.clear(input)
    await user.type(input, 'nonsense')
    await user.click(screen.getByRole('button', { name: 'Save links' }))

    expect(
      screen.getByText(/NONSENSE is not a Jira ticket key/)
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')
    ).toBe(false)
  })
})
