import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { STAGE_HINT } from '../../lib/jira-workflow'
import { JiraWorkflowPanel } from './JiraWorkflowPanel'

const PROJECT = {
  slug: 'CRAR',
  name: 'Catch Recording',
  jira: { projectKeys: ['CRAR'] }
}
const WORKFLOW_URL = '/api/projects/CRAR/jira/workflow'

const STAGES = [
  {
    id: 'todo',
    label: 'To Do',
    kind: 'todo',
    required: true,
    statuses: ['Backlog']
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    kind: 'active',
    required: false,
    statuses: ['In Progress']
  },
  {
    id: 'ready-for-review',
    label: 'Ready for Review',
    kind: 'waiting',
    required: false,
    statuses: []
  },
  {
    id: 'in-review',
    label: 'In Review',
    kind: 'active',
    required: false,
    statuses: []
  },
  {
    id: 'ready-for-test',
    label: 'Ready for Test',
    kind: 'waiting',
    required: false,
    statuses: []
  },
  {
    id: 'in-test',
    label: 'In Test',
    kind: 'active',
    required: false,
    statuses: []
  },
  {
    id: 'ready-for-release',
    label: 'Ready for Release',
    kind: 'waiting',
    required: false,
    statuses: []
  },
  {
    id: 'blocked',
    label: 'Blocked or On Hold',
    kind: 'waiting',
    required: false,
    statuses: []
  },
  {
    id: 'done',
    label: 'Done',
    kind: 'done',
    required: true,
    statuses: ['Done']
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    kind: 'excluded',
    required: false,
    statuses: []
  }
]

const stagesWith = (statuses) =>
  STAGES.map((s) => ({ ...s, statuses: statuses[s.id] ?? s.statuses }))

const workflowBody = (overrides = {}) => ({
  source: 'detected',
  version: 3,
  detectedAt: '2026-03-04T10:00:00.000Z',
  detectedCount: 3,
  stages: STAGES,
  suggestions: { todo: ['Open'], 'in-progress': ['Doing'] },
  ...overrides
})

const STATUSES = {
  jiraAvailable: true,
  statuses: [
    { name: 'Backlog', categoryKey: 'new', issueCount: 4, inJira: true },
    { name: 'Done', categoryKey: 'done', issueCount: 9, inJira: true },
    {
      name: 'Selected for Development',
      categoryKey: 'new',
      issueCount: 2,
      inJira: true
    }
  ]
}

let server

const json = (body, status = 200) => ({ status, body: JSON.stringify(body) })

const serve = (overrides = {}) => {
  server = {
    workflow: json(workflowBody()),
    put: json(workflowBody({ source: 'project', version: 4 })),
    statuses: json(STATUSES),
    ...overrides
  }
  fetchMock.mockResponse(async (req) => {
    const { pathname } = new URL(req.url)
    if (pathname.endsWith('/jira/statuses')) return server.statuses
    return req.method === 'PUT' ? server.put : server.workflow
  })
}

const callsTo = (suffix, method) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).endsWith(suffix) && (init?.method ?? 'GET') === method
  )

const renderPanel = async (project = PROJECT) => {
  const view = render(<JiraWorkflowPanel project={project} />)
  await screen.findByRole('group', { name: 'To Do' })
  return view
}

const combobox = (stage) =>
  screen.getByRole('combobox', { name: `Add a status to ${stage}` })

const removeButton = (status, stage) =>
  screen.getByRole('button', {
    name: new RegExp(`^Remove\\s?${status} from ${stage}$`)
  })

const save = (user) =>
  user.click(screen.getByRole('button', { name: 'Save workflow' }))

describe('#JiraWorkflowPanel', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
    serve()
  })

  describe('Loading and errors', () => {
    test('Should show a loading state first', () => {
      fetchMock.mockResponse(() => new Promise(() => {}))
      render(<JiraWorkflowPanel project={PROJECT} />)

      expect(screen.getByRole('status')).toHaveTextContent(
        'Loading Jira Workflow'
      )
    })

    test('Should show an error state and load again on retry', async () => {
      const user = userEvent.setup()
      serve({ workflow: json({}, 500) })
      render(<JiraWorkflowPanel project={PROJECT} />)

      expect(
        await screen.findByText(
          'We could not load the Jira workflow. Try again later.'
        )
      ).toBeVisible()

      server.workflow = json(workflowBody())
      await user.click(screen.getByRole('button', { name: /^Try again/ }))

      expect(await screen.findByRole('group', { name: 'To Do' })).toBeVisible()
      expect(callsTo('/jira/workflow', 'GET')).toHaveLength(2)
    })

    test('Should show an error state for a malformed workflow', async () => {
      serve({ workflow: json({ source: 'unknown', version: 1, stages: [] }) })
      render(<JiraWorkflowPanel project={PROJECT} />)

      expect(
        await screen.findByText(
          'We could not load the Jira workflow. Try again later.'
        )
      ).toBeVisible()
    })

    test('Should say the project has no Jira key when the backend answers 422', async () => {
      serve({
        workflow: json({ message: 'Project has no Jira project key' }, 422)
      })
      render(<JiraWorkflowPanel project={PROJECT} />)

      expect(
        await screen.findByText('This project has no Jira project key.')
      ).toBeVisible()
      expect(screen.queryByRole('group')).toBeNull()
    })

    test('Should not fetch anything for a project without a Jira key', () => {
      render(
        <JiraWorkflowPanel
          project={{ slug: 'CRAR', name: 'Catch Recording' }}
        />
      )

      expect(
        screen.getByText('This project has no Jira project key.')
      ).toBeVisible()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('Source line', () => {
    test('Should say when the workflow was detected from Jira', async () => {
      await renderPanel()

      expect(
        screen.getByText(
          'Detected from Jira on 4 March 2026. You can change it and save.'
        )
      ).toBeVisible()
    })

    test('Should say when the standard statuses are in use', async () => {
      serve({ workflow: json(workflowBody({ source: 'default' })) })
      await renderPanel()

      expect(
        screen.getByText(
          'Using the standard statuses. Save your own to change them.'
        )
      ).toBeVisible()
    })

    test('Should say who saved the project workflow and when', async () => {
      serve({
        workflow: json(
          workflowBody({
            source: 'project',
            updatedAt: '2026-03-05T09:30:00.000Z',
            updatedBy: { name: 'Ada Lovelace' }
          })
        )
      })
      await renderPanel()

      expect(
        screen.getByText('Saved by Ada Lovelace on 5 March 2026.')
      ).toBeVisible()
    })
  })

  describe('Stages', () => {
    test('Should show one section per stage in catalogue order', async () => {
      await renderPanel()

      expect(
        screen
          .getAllByRole('group')
          .map((g) => g.querySelector('legend').textContent)
      ).toStrictEqual(
        STAGES.map((s) => (s.kind === 'done' ? 'Definition of Done' : s.label))
      )
    })

    test('Should explain the To Do and Done stages as required', async () => {
      await renderPanel()

      expect(
        screen.getByRole('group', { name: 'To Do' })
      ).toHaveAccessibleDescription(
        'Required. A ticket starts when it first moves out of one of these statuses.'
      )
      expect(
        screen.getByRole('group', { name: 'Definition of Done' })
      ).toHaveAccessibleDescription(STAGE_HINT.done)
      expect(
        screen.getByRole('group', { name: 'In Progress' })
      ).toHaveAccessibleDescription(
        'Optional. Time in these statuses counts as active work.'
      )
    })

    test('Should list the statuses in each stage and say when one is empty', async () => {
      await renderPanel()

      const todo = screen.getByRole('list', { name: 'Statuses in To Do' })
      expect(within(todo).getByText('Backlog')).toBeVisible()
      expect(
        within(screen.getByRole('group', { name: 'Cancelled' })).getByText(
          'No statuses in this stage.'
        )
      ).toBeVisible()
    })
  })

  describe('Editing', () => {
    test('Should show the saved Definition of Done and move focus to its input', async () => {
      const user = userEvent.setup()
      await renderPanel()

      expect(screen.getByText('Done', { selector: 'strong' })).toBeVisible()

      await user.click(
        screen.getByRole('button', { name: 'Change the Definition of Done' })
      )

      expect(combobox('Definition of Done')).toHaveFocus()
    })

    test('Should show the saved Definition of Done, not unsaved edits', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.click(removeButton('Done', 'Definition of Done'))

      expect(screen.getByText('Done', { selector: 'strong' })).toBeVisible()
    })
    test('Should add a suggested status from the combobox', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.click(combobox('To Do'))
      await user.click(screen.getByRole('option', { name: 'Open' }))

      const todo = screen.getByRole('list', { name: 'Statuses in To Do' })
      expect(within(todo).getByText('Open')).toBeVisible()
      expect(combobox('To Do')).toHaveValue('')
      expect(screen.getByText('Open added to To Do')).toBeInTheDocument()
    })

    test('Should offer the statuses seen in Jira and not those already placed', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.click(combobox('To Do'))

      expect(
        screen.getAllByRole('option').map((o) => o.textContent)
      ).toStrictEqual(['Open', 'Selected for Development'])
    })

    test('Should add a custom status with the Add option', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.type(combobox('In Review'), '  Peer   review ')
      await user.click(
        screen.getByRole('option', { name: 'Add ‘Peer review’' })
      )

      expect(
        within(
          screen.getByRole('list', { name: 'Statuses in In Review' })
        ).getByText('Peer review')
      ).toBeVisible()
    })

    test('Should add a custom status with Enter', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.type(combobox('Cancelled'), 'Withdrawn{Enter}')

      expect(
        within(
          screen.getByRole('list', { name: 'Statuses in Cancelled' })
        ).getByText('Withdrawn')
      ).toBeVisible()
    })

    test('Should remove a status with an accessible name and return focus to the stage input', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.click(removeButton('In Progress', 'In Progress'))

      expect(
        screen.queryByRole('list', { name: 'Statuses in In Progress' })
      ).toBeNull()
      expect(combobox('In Progress')).toHaveFocus()
      expect(
        screen.getByText('In Progress removed from In Progress')
      ).toBeInTheDocument()
    })

    test('Should reject a status that is already in another stage', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.type(combobox('To Do'), 'done{Enter}')

      const input = combobox('To Do')
      expect(input).toHaveAccessibleDescription(
        'Error: ‘done’ is already in Definition of Done. A status can only be in one stage.'
      )
      expect(input).toBeInvalid()
      expect(
        within(
          screen.getByRole('list', { name: 'Statuses in To Do' })
        ).queryByText('done')
      ).toBeNull()
    })

    test('Should reject a status already in the same stage', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.type(combobox('To Do'), 'backlog{Enter}')

      expect(combobox('To Do')).toHaveAccessibleDescription(
        'Error: ‘backlog’ is already in To Do'
      )
    })

    test('Should reject a status that is too long', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.type(combobox('To Do'), `${'x'.repeat(61)}{Enter}`)

      expect(combobox('To Do')).toHaveAccessibleDescription(
        'Error: Status must be 60 characters or fewer'
      )
    })

    test('Should replace every stage with the suggested statuses', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.click(
        screen.getByRole('button', { name: 'Use suggested statuses' })
      )

      const todo = screen.getByRole('list', { name: 'Statuses in To Do' })
      expect(within(todo).getByText('Open')).toBeVisible()
      expect(within(todo).queryByText('Backlog')).toBeNull()
      expect(
        screen.getByText(/Suggested statuses added to every stage/)
      ).toBeInTheDocument()
    })
  })

  describe('Unsaved changes', () => {
    test('Should show no indicator until something changes', async () => {
      await renderPanel()

      expect(screen.queryByText(/You have unsaved changes/)).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'Cancel changes' })
      ).toBeNull()
    })

    test('Should warn about unsaved changes and cancel them', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.type(combobox('To Do'), 'Triage{Enter}')

      expect(screen.getByText(/You have unsaved changes/)).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Cancel changes' }))

      expect(screen.queryByText(/You have unsaved changes/)).toBeNull()
      expect(
        within(
          screen.getByRole('list', { name: 'Statuses in To Do' })
        ).queryByText('Triage')
      ).toBeNull()
    })

    test('Should ask the browser to confirm leaving only while changes are unsaved', async () => {
      const user = userEvent.setup()
      await renderPanel()
      const leave = () => {
        const event = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(event)
        return event.defaultPrevented
      }

      expect(leave()).toBe(false)
      await user.type(combobox('To Do'), 'Triage{Enter}')
      expect(leave()).toBe(true)
    })

    test('Should report unsaved changes to its parent and clear them on cancel and unmount', async () => {
      const user = userEvent.setup()
      const onDirtyChange = vi.fn()
      const { unmount } = render(
        <JiraWorkflowPanel project={PROJECT} onDirtyChange={onDirtyChange} />
      )
      await screen.findByRole('group', { name: 'To Do' })
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)

      await user.type(combobox('To Do'), 'Triage{Enter}')
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)

      await user.click(screen.getByRole('button', { name: 'Cancel changes' }))
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)

      await user.type(combobox('To Do'), 'Triage{Enter}')
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
      unmount()
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })
  })

  describe('Saving', () => {
    test('Should list a missing To Do and Done in an error summary and not send', async () => {
      const user = userEvent.setup()
      await renderPanel()

      await user.click(removeButton('Backlog', 'To Do'))
      await user.click(removeButton('Done', 'Definition of Done'))
      await save(user)

      const summary = screen.getByRole('alert')
      expect(within(summary).getByText('There is a problem')).toBeVisible()
      expect(
        within(summary).getByRole('link', {
          name: 'Add at least one status to To Do'
        })
      ).toHaveAttribute('href', '#stage-todo-input')
      expect(
        within(summary).getByRole('link', {
          name: 'Add at least one status to Definition of Done'
        })
      ).toBeVisible()
      expect(combobox('To Do')).toHaveAccessibleDescription(
        'Error: Add at least one status to To Do'
      )
      expect(callsTo('/jira/workflow', 'PUT')).toHaveLength(0)
    })

    test('Should move focus to the stage input from the error summary', async () => {
      const user = userEvent.setup()
      await renderPanel()
      await user.click(removeButton('Backlog', 'To Do'))
      await save(user)

      await user.click(
        screen.getByRole('link', { name: 'Add at least one status to To Do' })
      )

      expect(combobox('To Do')).toHaveFocus()
    })

    test('Should send the version and stages and confirm the save', async () => {
      const user = userEvent.setup()
      serve({
        put: json(
          workflowBody({
            source: 'project',
            version: 4,
            updatedAt: '2026-03-05T09:30:00.000Z',
            updatedBy: { name: 'Ada Lovelace' },
            stages: stagesWith({ todo: ['Backlog', 'Open'] })
          })
        )
      })
      await renderPanel()

      await user.click(combobox('To Do'))
      await user.click(screen.getByRole('option', { name: 'Open' }))
      await save(user)

      expect(
        await screen.findByText(
          'Jira workflow saved. Delivery metrics now use these stages.'
        )
      ).toBeVisible()
      expect(screen.getByRole('alert')).toHaveTextContent('Success')

      const [url, init] = callsTo('/jira/workflow', 'PUT')[0]
      expect(url).toBe(WORKFLOW_URL)
      expect(init.headers['x-requested-with']).toBe('XMLHttpRequest')
      expect(JSON.parse(init.body)).toStrictEqual({
        version: 3,
        stages: stagesWith({ todo: ['Backlog', 'Open'] }).map(
          ({ id, statuses }) => ({
            id,
            statuses
          })
        )
      })
      expect(
        screen.getByText('Saved by Ada Lovelace on 5 March 2026.')
      ).toBeVisible()
      expect(screen.queryByText(/You have unsaved changes/)).toBeNull()
    })

    test('Should send the new version on the next save', async () => {
      const user = userEvent.setup()
      serve({
        put: json(workflowBody({ source: 'project', version: 4 }))
      })
      await renderPanel()

      await user.type(combobox('To Do'), 'Triage{Enter}')
      await save(user)
      await screen.findByText(
        'Jira workflow saved. Delivery metrics now use these stages.'
      )
      await user.type(combobox('Blocked or On Hold'), 'Parked{Enter}')
      await save(user)

      await waitFor(() =>
        expect(callsTo('/jira/workflow', 'PUT')).toHaveLength(2)
      )
      expect(
        JSON.parse(callsTo('/jira/workflow', 'PUT')[1][1].body).version
      ).toBe(4)
    })

    test('Should show the backend message on a version conflict and reload on request', async () => {
      const user = userEvent.setup()
      serve({
        put: json({ message: 'The workflow was changed by someone else' }, 409)
      })
      await renderPanel()
      await user.type(combobox('To Do'), 'Triage{Enter}')

      await save(user)

      expect(
        within(screen.getByRole('alert')).getByText(
          'The workflow was changed by someone else'
        )
      ).toBeVisible()

      server.workflow = json(
        workflowBody({
          version: 5,
          stages: stagesWith({ todo: ['Backlog', 'Queued'] })
        })
      )
      await user.click(
        screen.getByRole('button', { name: 'Reload the workflow' })
      )

      const todo = await screen.findByText('Queued')
      expect(todo).toBeVisible()
      expect(callsTo('/jira/workflow', 'GET')).toHaveLength(2)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'Reload the workflow' })
      ).toBeNull()
      expect(screen.queryByText(/You have unsaved changes/)).toBeNull()
    })

    test('Should show the backend message for a rejected workflow', async () => {
      const user = userEvent.setup()
      serve({
        put: json({ message: 'Status names must be unique across stages' }, 400)
      })
      await renderPanel()
      await user.type(combobox('To Do'), 'Triage{Enter}')

      await save(user)

      expect(
        within(await screen.findByRole('alert')).getByText(
          'Status names must be unique across stages'
        )
      ).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Reload the workflow' })
      ).toBeNull()
    })

    test('Should use a plain message for a generic validation failure', async () => {
      const user = userEvent.setup()
      serve({ put: json({ message: 'Invalid request payload input' }, 400) })
      await renderPanel()
      await user.type(combobox('To Do'), 'Triage{Enter}')

      await save(user)

      expect(
        within(await screen.findByRole('alert')).getByText(
          'Some of the information was not accepted. Check your answers and try again.'
        )
      ).toBeVisible()
    })

    test('Should say the project has no Jira key when saving answers 422', async () => {
      const user = userEvent.setup()
      serve({ put: json({ message: 'Project has no Jira project key' }, 422) })
      await renderPanel()
      await user.type(combobox('To Do'), 'Triage{Enter}')

      await save(user)

      expect(
        within(await screen.findByRole('alert')).getByText(
          'This project has no Jira project key'
        )
      ).toBeVisible()
    })

    test('Should fall back to a generic message when the save fails without a response', async () => {
      const user = userEvent.setup()
      await renderPanel()
      await user.type(combobox('To Do'), 'Triage{Enter}')
      fetchMock.mockReject(new Error('network'))

      await save(user)

      expect(
        within(await screen.findByRole('alert')).getByText(
          'The Jira workflow could not be saved. Try again.'
        )
      ).toBeVisible()
    })

    test('Should keep the edits when a save fails', async () => {
      const user = userEvent.setup()
      serve({ put: json({}, 500) })
      await renderPanel()
      await user.type(combobox('To Do'), 'Triage{Enter}')

      await save(user)

      await screen.findByRole('alert')
      expect(
        within(
          screen.getByRole('list', { name: 'Statuses in To Do' })
        ).getByText('Triage')
      ).toBeVisible()
      expect(screen.getByText(/You have unsaved changes/)).toBeVisible()
    })
  })

  describe('Statuses found in this project', () => {
    test('Should show each Jira status with its stage', async () => {
      await renderPanel()

      const table = await screen.findByRole('table', {
        name: 'Jira Statuses and Their Stages'
      })
      expect(
        within(table).getByRole('row', { name: /^Backlog/ })
      ).toHaveTextContent('To Do')
      expect(
        within(table).getByRole('row', { name: /^Selected for Development/ })
      ).toHaveTextContent('Not mapped')
    })

    test('Should say when Jira could not be reached', async () => {
      serve({ statuses: json({ ...STATUSES, jiraAvailable: false }) })
      await renderPanel()

      expect(
        await screen.findByText(
          /We could not reach Jira, so this list only shows/
        )
      ).toHaveTextContent(/already linked to pull requests/)
    })

    test('Should say when Jira statuses have not been found yet', async () => {
      serve({ statuses: json({ jiraAvailable: true, statuses: [] }) })
      await renderPanel()

      expect(
        await screen.findByText(
          'Statuses appear here when Jira can be reached or a pull request links to a Jira ticket.'
        )
      ).toBeVisible()
    })

    test('Should show an error when the statuses cannot be loaded', async () => {
      serve({ statuses: json({}, 500) })
      await renderPanel()

      expect(
        await screen.findByText(
          'We could not load the Jira statuses. Try again later.'
        )
      ).toBeVisible()
    })

    test('Should check the statuses again on request', async () => {
      const user = userEvent.setup()
      await renderPanel()
      await screen.findByRole('table', {
        name: 'Jira Statuses and Their Stages'
      })

      await user.click(
        screen.getByRole('button', { name: 'Check Jira statuses again' })
      )

      await waitFor(() =>
        expect(callsTo('/jira/statuses', 'GET')).toHaveLength(2)
      )
    })
  })

  describe('Accessibility', () => {
    test('Should have no detectable accessibility violations', async () => {
      const { container } = await renderPanel()
      await screen.findByRole('table', {
        name: 'Jira Statuses and Their Stages'
      })

      expect(await axeViolations(container)).toStrictEqual([])
    })

    test('Should have no detectable accessibility violations with errors shown', async () => {
      const user = userEvent.setup()
      const { container } = await renderPanel()
      await user.click(removeButton('Backlog', 'To Do'))
      await save(user)
      await screen.findByRole('alert')

      expect(await axeViolations(container)).toStrictEqual([])
    })
  })
})
