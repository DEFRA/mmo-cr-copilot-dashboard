import { useEffect, useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { OnboardingView } from './OnboardingView.jsx'

const MAPPED = [{ fullName: 'DEFRA/already-mapped', projectSlug: 'CRAR' }]

const jsonOf = (body) => JSON.stringify(body)

/** The BFF as the view sees it; `post` and `put` answer the writes. */
const backend = ({
  unassigned = ['DEFRA/new-a', 'DEFRA/new-b', 'not a repository'],
  repositories = MAPPED,
  post = () => jsonOf({}),
  put = () => jsonOf({})
} = {}) =>
  fetchMock.mockResponse(async (request) => {
    const { pathname } = new URL(request.url, 'http://localhost')
    if (request.method === 'POST') return post(request)
    if (request.method === 'PUT') return put(request)
    if (pathname === '/api/repositories/unassigned') {
      return jsonOf({ repositories: unassigned })
    }
    return jsonOf({ repositories })
  })

const writes = (method) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)

function Wizard({ initialStep, callbacks = {}, allowed = true }) {
  const [step, setStep] = useState(initialStep)
  // Lets a test move the route, as the browser back button would.
  useEffect(() => setStep(initialStep), [initialStep])
  const { onProjectCreated, onLaunch, onNavigateHome } = callbacks
  return (
    <OnboardingView
      allowed={allowed}
      step={step}
      onStepChange={(next) => {
        callbacks.onStepChange?.(next)
        setStep(next)
      }}
      onProjectCreated={onProjectCreated}
      onLaunch={onLaunch}
      onNavigateHome={onNavigateHome}
    />
  )
}

const renderWizard = (props = {}) => {
  const callbacks = {
    onStepChange: vi.fn(),
    onProjectCreated: vi.fn().mockResolvedValue(undefined),
    onLaunch: vi.fn(),
    onNavigateHome: vi.fn(),
    ...props.callbacks
  }
  const user = userEvent.setup()
  const view = render(<Wizard {...props} callbacks={callbacks} />)
  return { user, callbacks, ...view }
}

const heading = (name, level = 1) =>
  screen.getByRole('heading', { level, name })

const save = (user) =>
  user.click(screen.getByRole('button', { name: 'Save and continue' }))

const openTask = (user, name) => user.click(screen.getByRole('link', { name }))

const taskItem = (title) => screen.getByText(title).closest('li')

const backToTasks = (user) =>
  user.click(screen.getByRole('link', { name: 'Back to task list' }))

async function fillDetails(user, { type = 'AI-native', jira = '' } = {}) {
  await user.type(screen.getByLabelText('Project name'), 'New Service')
  await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')
  await user.click(screen.getByLabelText(type))
  if (type === 'AI-adopted') {
    await user.type(screen.getByLabelText('Day'), '1')
    await user.type(screen.getByLabelText('Month'), '10')
    await user.type(screen.getByLabelText('Year'), '2025')
  }
  if (jira) await user.type(screen.getByLabelText(/^Jira project keys/), jira)
}

async function completeDetails(user, options) {
  await openTask(user, 'Project Details')
  await fillDetails(user, options)
  await save(user)
  await screen.findByRole('heading', { level: 1, name: 'Onboard a Project' })
}

async function toRepositories(user, details) {
  await completeDetails(user, details)
  await openTask(user, 'Connect Repositories')
}

async function completeRepositories(user, names = ['DEFRA/new-a']) {
  await openTask(user, 'Connect Repositories')
  for (const name of names) {
    await user.click(await screen.findByRole('checkbox', { name }))
  }
  await save(user)
  await screen.findByRole('heading', { level: 1, name: 'Onboard a Project' })
}

async function reachReview(user, options) {
  await completeDetails(user, options?.details)
  await completeRepositories(user, options?.repositories)
  await openTask(user, 'Review and Onboard Project')
  await screen.findByRole('heading', {
    level: 1,
    name: 'Review and Onboard Project'
  })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  backend()
})

describe('#OnboardingView access', () => {
  test('Should refuse anyone who is not a dashboard admin', async () => {
    const { callbacks, user } = renderWizard({ allowed: false })

    expect(heading('You Cannot Onboard Projects')).toBeInTheDocument()
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument()
    expect(document.title).toBe('Access Refused – Copilot Delivery Insights')
    expect(fetchMock.mock.calls).toHaveLength(0)

    await user.click(screen.getByRole('link', { name: 'Back to overview' }))

    expect(callbacks.onNavigateHome).toHaveBeenCalledTimes(1)
  })

  test('Should have no accessibility violations when refused', async () => {
    const { container } = renderWizard({ allowed: false })

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#OnboardingView task list', () => {
  test('Should open on the task list with nothing started', () => {
    renderWizard()

    expect(heading('Onboard a Project')).toBeInTheDocument()
    expect(document.title).toBe('Onboard a Project – Copilot Delivery Insights')
    expect(screen.getByText('You have completed 0 of 3 tasks.')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(
      within(taskItem('Project Details')).getByText('Not started')
    ).toHaveClass('govuk-tag')
  })

  test('Should block the later tasks until the earlier ones are done', () => {
    renderWizard()

    for (const title of [
      'Connect Repositories',
      'Review and Onboard Project'
    ]) {
      expect(
        screen.queryByRole('link', { name: title })
      ).not.toBeInTheDocument()
      expect(
        within(taskItem(title)).getByText('Cannot start yet')
      ).not.toHaveClass('govuk-tag')
    }
  })

  test('Should go back to the overview from the task list', async () => {
    const { user, callbacks } = renderWizard()

    await user.click(screen.getByRole('link', { name: 'Back to overview' }))

    expect(callbacks.onNavigateHome).toHaveBeenCalledTimes(1)
  })

  test('Should open a task from its link', async () => {
    const { user, callbacks } = renderWizard()

    const link = screen.getByRole('link', { name: 'Project Details' })
    expect(link).toHaveAttribute('href', '#/onboarding/details')
    await user.click(link)

    expect(callbacks.onStepChange).toHaveBeenCalledWith('details')
    expect(heading('Project Details')).toHaveFocus()
  })

  test('Should leave a modified click on a task link to the browser', () => {
    const { callbacks } = renderWizard()

    fireEvent.click(screen.getByRole('link', { name: 'Project Details' }), {
      ctrlKey: true
    })

    expect(callbacks.onStepChange).not.toHaveBeenCalled()
  })

  test('Should mark details in progress until they are valid', async () => {
    const { user } = renderWizard()
    await openTask(user, 'Project Details')
    await user.type(screen.getByLabelText('Project name'), 'New Service')

    await backToTasks(user)

    expect(
      within(taskItem('Project Details')).getByText('In progress')
    ).toBeVisible()
    expect(screen.getByText('You have completed 0 of 3 tasks.')).toBeVisible()
  })

  test('Should complete the details task and open the repositories', async () => {
    const { user } = renderWizard()

    await completeDetails(user)

    expect(
      within(taskItem('Project Details')).getByText('Completed')
    ).toHaveClass('govuk-tag--green')
    expect(
      within(taskItem('Connect Repositories')).getByText('Not started')
    ).toBeVisible()
    expect(screen.getByText('You have completed 1 of 3 tasks.')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Connect Repositories' })
    ).toBeInTheDocument()
    expect(
      within(taskItem('Review and Onboard Project')).getByText(
        'Cannot start yet'
      )
    ).toBeVisible()
  })

  test('Should mark repositories in progress while they are invalid', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })
    await user.type(screen.getByLabelText(/^Another repository/), 'nonsense')

    await backToTasks(user)

    expect(
      within(taskItem('Connect Repositories')).getByText('In progress')
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: 'Review and Onboard Project' })
    ).not.toBeInTheDocument()
  })

  test('Should make the review ready once both tasks are complete', async () => {
    const { user } = renderWizard()

    await completeDetails(user)
    await completeRepositories(user)

    expect(
      within(taskItem('Connect Repositories')).getByText('Completed')
    ).toBeVisible()
    expect(
      within(taskItem('Review and Onboard Project')).getByText('Ready')
    ).toBeVisible()
    expect(screen.getByText('You have completed 2 of 3 tasks.')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Review and Onboard Project' })
    ).toHaveAttribute('href', '#/onboarding/check')
  })

  test('Should block the review again when the details become invalid', async () => {
    const { user } = renderWizard()
    await completeDetails(user)
    await completeRepositories(user)

    await openTask(user, 'Project Details')
    await user.clear(screen.getByLabelText('Project name'))
    await backToTasks(user)

    expect(
      screen.queryByRole('link', { name: 'Review and Onboard Project' })
    ).not.toBeInTheDocument()
    expect(
      within(taskItem('Connect Repositories')).getByText('Cannot start yet')
    ).toBeVisible()
  })

  test('Should open the details task when requested', () => {
    renderWizard({ initialStep: 'details' })

    expect(heading('Project Details')).toBeInTheDocument()
    expect(screen.getByText('Onboard a Project')).toHaveClass('govuk-caption-l')
    expect(document.title).toBe(
      'Project Details – Onboard a Project – Copilot Delivery Insights'
    )
  })

  test('Should show the task list when the repositories are requested first', () => {
    renderWizard({ initialStep: 'repositories' })

    expect(heading('Onboard a Project')).toBeInTheDocument()
  })

  test('Should show the task list when the review is requested too early', () => {
    renderWizard({ initialStep: 'check' })

    expect(heading('Onboard a Project')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Onboard project' })).toBeNull()
  })

  test('Should have no accessibility violations', async () => {
    const { container, user } = renderWizard()

    expect(await axeViolations(container)).toStrictEqual([])

    await completeDetails(user)
    await completeRepositories(user)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#OnboardingView project details', () => {
  test('Should ask for the adoption date only for an AI-adopted project', async () => {
    const { user } = renderWizard({ initialStep: 'details' })

    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('AI-adopted'))
    expect(screen.getByLabelText('Day')).toBeInTheDocument()

    await user.click(screen.getByLabelText('AI-native'))
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()
  })

  test('Should list every problem in an error summary linked to the fields', async () => {
    const { user, callbacks } = renderWizard({ initialStep: 'details' })

    await save(user)

    const summary = screen.getByRole('alert')
    expect(
      within(summary).getByRole('link', { name: 'Enter a project name' })
    ).toHaveAttribute('href', '#project-name')
    expect(
      within(summary).getByRole('link', { name: 'Enter a project slug' })
    ).toHaveAttribute('href', '#project-slug')
    expect(
      within(summary).getByRole('link', { name: 'Select the project type' })
    ).toHaveAttribute('href', '#project-type')
    expect(screen.getByLabelText('Project name')).toHaveAccessibleDescription(
      'Error: Enter a project name'
    )
    expect(callbacks.onStepChange).not.toHaveBeenCalled()
  })

  test('Should report the adoption date and Jira keys', async () => {
    const { user } = renderWizard({ initialStep: 'details' })

    await user.type(screen.getByLabelText('Project name'), 'New Service')
    await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')
    await user.click(screen.getByLabelText('AI-adopted'))
    await user.type(screen.getByLabelText(/^Jira project keys/), 'mmocr')
    await save(user)

    const summary = screen.getByRole('alert')
    expect(
      within(summary).getByRole('link', {
        name: 'Enter the date the team adopted Copilot'
      })
    ).toHaveAttribute('href', '#project-adoption-day')
    expect(
      within(summary).getByRole('link', { name: /Jira project keys must be/ })
    ).toBeInTheDocument()
  })

  test('Should return to the task list with valid details', async () => {
    const { user, callbacks } = renderWizard({ initialStep: 'details' })

    await fillDetails(user)
    await save(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    expect(heading('Onboard a Project')).toHaveFocus()
  })

  test('Should go back to the task list with the answers kept', async () => {
    const { user, callbacks } = renderWizard()
    await openTask(user, 'Project Details')
    await user.type(screen.getByLabelText('Project name'), 'Half Done')

    await backToTasks(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    await openTask(user, 'Project Details')
    expect(screen.getByLabelText('Project name')).toHaveValue('Half Done')
  })

  test('Should have no accessibility violations', async () => {
    const { container, user } = renderWizard({ initialStep: 'details' })

    expect(await axeViolations(container)).toStrictEqual([])

    await save(user)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#OnboardingView repositories', () => {
  test('Should offer repositories that are sending data but have no project', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    const group = await screen.findByRole('group', {
      name: 'Repositories sending data'
    })
    expect(within(group).getAllByRole('checkbox')).toHaveLength(2)
    expect(
      within(group).queryByRole('checkbox', { name: 'not a repository' })
    ).not.toBeInTheDocument()
  })

  test('Should reveal an optional SonarCloud key for each selected repository', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    const box = await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })

    expect(
      screen.queryByLabelText('SonarCloud project key (optional)')
    ).not.toBeInTheDocument()

    await user.click(box)

    expect(
      screen.getByLabelText('SonarCloud project key (optional)')
    ).toHaveAccessibleDescription(/For DEFRA\/new-a/)

    await user.click(box)

    expect(
      screen.queryByLabelText('SonarCloud project key (optional)')
    ).not.toBeInTheDocument()
  })

  test('Should require at least one repository', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })

    await save(user)

    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: 'Add at least one repository'
      })
    ).toHaveAttribute('href', '#repository-select')
  })

  test('Should point that error at the manual field when nothing is listed', async () => {
    backend({ unassigned: [] })
    const { user } = renderWizard()
    await toRepositories(user)
    await screen.findByText(/No repository is sending data without a project/)

    await save(user)

    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: 'Add at least one repository'
      })
    ).toHaveAttribute('href', '#manual-repository')
    expect(
      screen.getByLabelText(/^Another repository/)
    ).toHaveAccessibleDescription(/Error: Add at least one repository/)
  })

  test('Should check a repository typed by hand', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })

    await user.type(screen.getByLabelText(/^Another repository/), 'nonsense')
    await user.type(
      screen.getByLabelText(/^SonarCloud project key for that/),
      'has space'
    )
    await save(user)

    const summary = screen.getByRole('alert')
    expect(
      within(summary).getByRole('link', { name: /owner\/name/ })
    ).toHaveAttribute('href', '#manual-repository')
    expect(
      within(summary).getByRole('link', { name: /Sonar project key must only/ })
    ).toHaveAttribute('href', '#manual-sonar-key')
  })

  test('Should refuse a repository that already belongs to a project', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })

    await user.type(
      screen.getByLabelText(/^Another repository/),
      'DEFRA/already-mapped'
    )
    await save(user)

    expect(
      within(screen.getByRole('alert')).getByText(
        'DEFRA/already-mapped is already mapped to a project'
      )
    ).toBeInTheDocument()
  })

  test('Should refuse a Sonar key that is not valid for a selected repository', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.click(
      await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })
    )
    await user.type(
      screen.getByLabelText('SonarCloud project key (optional)'),
      'has space'
    )
    await save(user)

    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: /DEFRA\/new-a: Sonar project key must only/
      })
    ).toHaveAttribute('href', '#sonar-key-0')
  })

  test('Should say when the repositories cannot be loaded', async () => {
    fetchMock.mockResponse(async () => ({ status: 500, body: '{}' }))
    const { user } = renderWizard()
    await toRepositories(user)

    expect(
      await screen.findByText(/We could not load the repositories that are/)
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Another repository/)).toBeInTheDocument()
  })

  test('Should announce that repositories are loading', async () => {
    fetchMock.mockResponse(() => new Promise(() => {}))
    const { user } = renderWizard()
    await toRepositories(user)

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Loading repositories that are sending data…'
    )
  })

  test('Should return to the task list with the choice kept', async () => {
    const { user, callbacks } = renderWizard()
    await completeDetails(user)
    await completeRepositories(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    await openTask(user, 'Connect Repositories')
    expect(
      await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })
    ).toBeChecked()
  })

  test('Should go back to the task list without saving', async () => {
    const { user, callbacks } = renderWizard()
    await toRepositories(user)
    await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })

    await backToTasks(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    expect(
      within(taskItem('Connect Repositories')).getByText('Not started')
    ).toBeVisible()
  })

  test('Should have no accessibility violations', async () => {
    const { container, user } = renderWizard()
    await toRepositories(user)
    await user.click(
      await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })
    )

    expect(await axeViolations(container)).toStrictEqual([])

    await user.click(screen.getByRole('checkbox', { name: 'DEFRA/new-a' }))
    await save(user)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#OnboardingView review', () => {
  test('Should summarise the answers in cards', async () => {
    const { user } = renderWizard()
    await toRepositories(user, { type: 'AI-adopted', jira: 'MMOCR, FES' })
    await user.click(
      await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })
    )
    await user.type(
      screen.getByLabelText('SonarCloud project key (optional)'),
      'DEFRA_new-a'
    )
    await user.type(
      screen.getByLabelText(/^Another repository/),
      'DEFRA/typed-by-hand'
    )
    await save(user)
    await openTask(user, 'Review and Onboard Project')

    const details = (
      await screen.findByRole('heading', { level: 2, name: 'Project Details' })
    ).closest('.govuk-summary-card')
    expect(within(details).getByText('New Service')).toBeInTheDocument()
    expect(within(details).getByText('NSVC')).toBeInTheDocument()
    expect(within(details).getByText('AI-adopted')).toBeInTheDocument()
    expect(within(details).getByText('1 October 2025')).toBeInTheDocument()
    expect(within(details).getByText('MMOCR, FES')).toBeInTheDocument()

    const repos = screen
      .getByRole('heading', { level: 2, name: 'Repositories' })
      .closest('.govuk-summary-card')
    expect(within(repos).getByText('DEFRA/new-a')).toBeInTheDocument()
    expect(within(repos).getByText('DEFRA_new-a')).toBeInTheDocument()
    expect(within(repos).getByText('DEFRA/typed-by-hand')).toBeInTheDocument()
    expect(
      within(repos).getByText('No SonarCloud project key')
    ).toBeInTheDocument()
    expect(document.title).toBe(
      'Review and Onboard Project – Onboard a Project – Copilot Delivery Insights'
    )
  })

  test('Should show no adoption date or Jira keys for an AI-native project', async () => {
    const { user } = renderWizard()
    await reachReview(user)

    expect(screen.queryByText('Adoption start date')).not.toBeInTheDocument()
    expect(screen.getByText('AI-native')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
  })

  test('Should keep the answers when the details are changed', async () => {
    const { user, callbacks } = renderWizard()
    await reachReview(user)

    await user.click(
      screen.getByRole('link', { name: 'Change (Project Details)' })
    )

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith('details')
    const name = await screen.findByLabelText('Project name')
    expect(name).toHaveValue('New Service')

    await user.clear(name)
    await user.type(name, 'Renamed Service')
    await save(user)
    await openTask(user, 'Review and Onboard Project')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Review and Onboard Project'
      })
    ).toHaveFocus()
    expect(screen.getByText('Renamed Service')).toBeInTheDocument()
  })

  test('Should keep the answers when the repositories are changed', async () => {
    const { user } = renderWizard()
    await reachReview(user)

    await user.click(
      screen.getByRole('link', { name: 'Change (Repositories)' })
    )
    expect(
      await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })
    ).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'DEFRA/new-b' }))
    await save(user)
    await openTask(user, 'Review and Onboard Project')

    const repos = (
      await screen.findByRole('heading', { level: 2, name: 'Repositories' })
    ).closest('.govuk-summary-card')
    expect(within(repos).getByText('DEFRA/new-b')).toBeInTheDocument()
  })

  test('Should go back to the task list from the review', async () => {
    const { user, callbacks } = renderWizard()
    await reachReview(user)

    await backToTasks(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Onboard a Project'
      })
    ).toBeInTheDocument()
  })

  test('Should drop an adoption date typed before switching to AI-native', async () => {
    const { user } = renderWizard()
    await openTask(user, 'Project Details')
    await user.type(screen.getByLabelText('Project name'), 'New Service')
    await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')
    await user.click(screen.getByLabelText('AI-adopted'))
    await user.type(screen.getByLabelText('Day'), '99')
    await user.click(screen.getByLabelText('AI-native'))
    await save(user)
    await completeRepositories(user)
    await openTask(user, 'Review and Onboard Project')
    await user.click(
      await screen.findByRole('button', { name: 'Onboard project' })
    )
    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })

    const [, init] = writes('POST')[0]
    expect(JSON.parse(init.body).adoptionStartDate).toBeUndefined()
  })

  test('Should have no accessibility violations', async () => {
    const { container, user } = renderWizard()
    await reachReview(user, { details: { type: 'AI-adopted' } })

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#OnboardingView submission', () => {
  test('Should create the project, connect the repositories and confirm', async () => {
    const { user, callbacks } = renderWizard()
    await toRepositories(user, { type: 'AI-adopted', jira: 'MMOCR' })
    await user.click(
      await screen.findByRole('checkbox', { name: 'DEFRA/new-a' })
    )
    await user.type(
      screen.getByLabelText('SonarCloud project key (optional)'),
      'DEFRA_new-a'
    )
    await user.type(
      screen.getByLabelText(/^Another repository/),
      'DEFRA/typed-by-hand'
    )
    await save(user)
    await openTask(user, 'Review and Onboard Project')

    await user.click(
      await screen.findByRole('button', { name: 'Onboard project' })
    )

    const panel = (
      await screen.findByRole('heading', {
        level: 1,
        name: 'Project Onboarded'
      })
    ).closest('.govuk-panel')
    expect(panel).toHaveClass('govuk-panel--confirmation')
    expect(within(panel).getByText('New Service')).toBeInTheDocument()
    expect(within(panel).getByText('NSVC')).toBeInTheDocument()

    const [postUrl, post] = writes('POST')[0]
    expect(postUrl).toBe('/api/projects')
    expect(post.headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(JSON.parse(post.body)).toStrictEqual({
      name: 'New Service',
      slug: 'NSVC',
      type: 'ai-adopted',
      adoptionStartDate: '2025-10-01T00:00:00.000Z',
      jira: { projectKeys: ['MMOCR'] }
    })

    const puts = writes('PUT')
    expect(puts.map(([url]) => url).sort()).toStrictEqual([
      '/api/repositories/DEFRA%2Fnew-a',
      '/api/repositories/DEFRA%2Ftyped-by-hand'
    ])
    const sonar = puts.find(([url]) => url.endsWith('new-a'))
    expect(JSON.parse(sonar[1].body)).toStrictEqual({
      projectSlug: 'NSVC',
      sonarProjectKey: 'DEFRA_new-a'
    })
    expect(sonar[1].headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(callbacks.onProjectCreated).toHaveBeenCalledWith('NSVC')
    expect(callbacks.onStepChange).toHaveBeenLastCalledWith('confirmation')

    const table = screen.getByRole('table', { name: 'Connected repositories' })
    expect(within(table).getByText('DEFRA/new-a')).toBeInTheDocument()
    expect(within(table).getByText('DEFRA_new-a')).toBeInTheDocument()
    expect(within(table).getByText('None')).toBeInTheDocument()
    expect(screen.queryByText(/could not be connected/)).not.toBeInTheDocument()
    expect(heading('What Happens Next', 2)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Help page' })).toHaveAttribute(
      'href',
      '#/help'
    )
  })

  test('Should warn about a repository that could not be connected', async () => {
    backend({
      put: (request) =>
        request.url.endsWith('new-b')
          ? { status: 409, body: jsonOf({ message: 'DEFRA/new-b is taken' }) }
          : jsonOf({})
    })
    const { user } = renderWizard()
    await reachReview(user, {
      repositories: ['DEFRA/new-a', 'DEFRA/new-b']
    })

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })
    expect(
      screen.getByText('1 repository could not be connected')
    ).toBeInTheDocument()
    expect(screen.getByText('DEFRA/new-b is taken')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Connected repositories' })
    expect(within(table).getByText('DEFRA/new-a')).toBeInTheDocument()
    expect(within(table).queryByText('DEFRA/new-b')).not.toBeInTheDocument()
  })

  test('Should use a generic message when a connection fails without one', async () => {
    backend({
      put: (request) =>
        request.url.endsWith('new-a')
          ? { status: 500, body: 'not json' }
          : jsonOf({})
    })
    const { user } = renderWizard()
    await reachReview(user, {
      repositories: ['DEFRA/new-a', 'DEFRA/new-b']
    })

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await screen.findByText('DEFRA/new-a could not be connected')
    ).toBeInTheDocument()
  })

  test('Should cope when every repository fails to connect', async () => {
    backend({
      put: () => {
        throw new Error('offline')
      }
    })
    const { user } = renderWizard()
    await reachReview(user, {
      repositories: ['DEFRA/new-a', 'DEFRA/new-b']
    })

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await screen.findByText('2 repositories could not be connected')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('table', { name: 'Connected repositories' })
    ).not.toBeInTheDocument()
  })

  test('Should stay on the review with the error when the project cannot be created', async () => {
    let attempts = 0
    backend({
      post: () => {
        attempts += 1
        return attempts === 1
          ? { status: 409, body: jsonOf({ message: 'Project NSVC exists' }) }
          : jsonOf({})
      }
    })
    const { user } = renderWizard()
    await reachReview(user)

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await within(await screen.findByRole('alert')).findByText(
        'Project NSVC exists'
      )
    ).toBeInTheDocument()
    expect(writes('PUT')).toHaveLength(0)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Review and Onboard Project'
      })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Project Onboarded'
      })
    ).toBeInTheDocument()
  })

  test('Should use a generic message when the project error has no body', async () => {
    backend({ post: () => ({ status: 500, body: 'not json' }) })
    const { user } = renderWizard()
    await reachReview(user)

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await screen.findByText('The project could not be added')
    ).toBeInTheDocument()
  })

  test('Should send a duplicate click only once', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    backend({
      post: async () => {
        await gate
        return jsonOf({})
      }
    })
    const { user } = renderWizard()
    await reachReview(user)
    const button = screen.getByRole('button', { name: 'Onboard project' })

    fireEvent.click(button)
    fireEvent.click(button)

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Onboarding the project…'
    )
    expect(button).toBeDisabled()
    release()
    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })
    expect(writes('POST')).toHaveLength(1)
  })

  test('Should not create the project again when a task is revisited', async () => {
    const view = renderWizard()
    await reachReview(view.user)
    await view.user.click(
      screen.getByRole('button', { name: 'Onboard project' })
    )
    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })

    view.rerender(<Wizard initialStep="check" callbacks={view.callbacks} />)

    expect(heading('Project Onboarded')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Onboard project' })).toBeNull()
    expect(writes('POST')).toHaveLength(1)
  })

  test('Should launch the new project overview', async () => {
    const { user, callbacks } = renderWizard()
    await reachReview(user)
    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    await user.click(
      await screen.findByRole('button', { name: 'Launch project overview' })
    )

    expect(callbacks.onLaunch).toHaveBeenCalledWith('NSVC')
  })

  test('Should start another project from a clean task list', async () => {
    const { user, callbacks } = renderWizard()
    await reachReview(user)
    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    await user.click(
      await screen.findByRole('button', { name: 'Onboard another project' })
    )

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Onboard a Project'
      })
    ).toBeInTheDocument()
    expect(
      within(taskItem('Project Details')).getByText('Not started')
    ).toBeVisible()

    await openTask(user, 'Project Details')

    expect(screen.getByLabelText('Project name')).toHaveValue('')
    expect(screen.getByLabelText('AI-native')).not.toBeChecked()
  })

  test('Should have no accessibility violations on the confirmation', async () => {
    backend({
      put: (request) =>
        request.url.endsWith('new-b') ? { status: 500, body: '{}' } : jsonOf({})
    })
    const { container, user } = renderWizard()
    await reachReview(user, { repositories: ['DEFRA/new-a', 'DEFRA/new-b'] })
    await user.click(screen.getByRole('button', { name: 'Onboard project' }))
    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
