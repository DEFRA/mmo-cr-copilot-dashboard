import { useEffect, useState } from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { ANNOUNCE_DELAY_MS } from '../govuk/Combobox.jsx'
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

async function fillDetails(
  user,
  { type = 'AI-Native', jira = type === 'AI-Native' ? 'MMOCR' : '' } = {}
) {
  await user.type(screen.getByLabelText('Project name'), 'New Service')
  await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')
  await user.click(screen.getByLabelText(type))
  if (type === 'AI-Adopted') {
    await user.type(screen.getByLabelText('Day'), '1')
    await user.type(screen.getByLabelText('Month'), '10')
    await user.type(screen.getByLabelText('Year'), '2025')
  }
  if (jira) await user.type(screen.getByLabelText(/^Jira project key/), jira)
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

const repoInput = () =>
  screen.findByRole('combobox', { name: 'Add a repository' })

async function chooseRepository(user, name) {
  await user.click(await repoInput())
  await user.click(await screen.findByRole('option', { name }))
}

async function completeRepositories(user, names = ['DEFRA/new-a']) {
  await openTask(user, 'Connect Repositories')
  for (const name of names) await chooseRepository(user, name)
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

  test('Should not count a repository that was typed but not added', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.type(await repoInput(), 'DEFRA/typed')

    await backToTasks(user)

    expect(
      within(taskItem('Connect Repositories')).getByText('Not started')
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
  test('Should ask for the adoption date only for an AI-Adopted project', async () => {
    const { user } = renderWizard({ initialStep: 'details' })

    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('AI-Adopted'))
    expect(screen.getByLabelText('Day')).toBeInTheDocument()

    await user.click(screen.getByLabelText('AI-Native'))
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

  test('Should report the adoption date and a list of Jira keys', async () => {
    const { user } = renderWizard({ initialStep: 'details' })

    await user.type(screen.getByLabelText('Project name'), 'New Service')
    await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')
    await user.click(screen.getByLabelText('AI-Adopted'))
    await user.type(screen.getByLabelText(/^Jira project key/), 'MMOCR, FES')
    await save(user)

    const summary = screen.getByRole('alert')
    expect(
      within(summary).getByRole('link', {
        name: 'Enter the date the team adopted Copilot'
      })
    ).toHaveAttribute('href', '#project-adoption-day')
    expect(
      within(summary).getByRole('link', {
        name: 'Enter one Jira project key, with no commas or spaces, like MMOCR'
      })
    ).toHaveAttribute('href', '#project-jira-key')
  })

  test('Should ask for one Jira key with no mention of commas', () => {
    renderWizard({ initialStep: 'details' })

    const field = screen.getByLabelText('Jira project key (optional)')
    expect(field).toHaveAccessibleDescription(
      'The one Jira project for this project, like MMOCR.'
    )
    expect(screen.queryByText(/comma/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Jira project keys/)).toBeNull()
  })

  test('Should make the Jira key mandatory as soon as AI-Native is chosen', async () => {
    const { user, callbacks } = renderWizard({ initialStep: 'details' })
    await user.type(screen.getByLabelText('Project name'), 'New Service')
    await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')

    await user.click(screen.getByLabelText('AI-Native'))
    const field = screen.getByLabelText('Jira project key')
    expect(field).toHaveAccessibleDescription(/Required for an AI-Native/)
    await save(user)

    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: 'Enter a Jira project key'
      })
    ).toHaveAttribute('href', '#project-jira-key')
    expect(field).toHaveAccessibleDescription(/Error: Enter a Jira project key/)
    expect(callbacks.onStepChange).not.toHaveBeenCalled()
  })

  test('Should drop the missing Jira key error when switching to AI-Adopted', async () => {
    const { user } = renderWizard({ initialStep: 'details' })
    await user.click(screen.getByLabelText('AI-Native'))
    await save(user)
    expect(
      screen.getByLabelText('Jira project key')
    ).toHaveAccessibleDescription(/Enter a Jira project key/)

    await user.click(screen.getByLabelText('AI-Adopted'))

    const field = screen.getByLabelText('Jira project key (optional)')
    expect(field).not.toHaveAccessibleDescription(/Enter a Jira project key/)

    await user.click(screen.getByLabelText('AI-Native'))
    expect(
      screen.getByLabelText('Jira project key')
    ).not.toHaveAccessibleDescription(/Error/)
  })

  test('Should give every text box the same shared width', () => {
    renderWizard({ initialStep: 'details' })

    const boxes = [
      screen.getByLabelText('Project name'),
      screen.getByLabelText(/^Project slug/),
      screen.getByLabelText(/^Jira project key/)
    ]
    for (const box of boxes) {
      expect(box.className).toBe('govuk-input')
    }
  })

  test('Should centre every step in one column', async () => {
    const { container, user } = renderWizard()

    expect(container.firstElementChild).toHaveClass('app-onboarding')
    expect(container.querySelector('.govuk-grid-row')).toBeNull()

    await openTask(user, 'Project Details')
    expect(container.firstElementChild).toHaveClass('app-onboarding')
    await fillDetails(user)
    await save(user)
    await openTask(user, 'Connect Repositories')
    expect(container.firstElementChild).toHaveClass('app-onboarding')
    await chooseRepository(user, 'DEFRA/new-a')
    await save(user)
    await openTask(user, 'Review and Onboard Project')
    expect(container.firstElementChild).toHaveClass('app-onboarding')
    await user.click(
      await screen.findByRole('button', { name: 'Onboard project' })
    )
    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })
    expect(container.firstElementChild).toHaveClass('app-onboarding')
  })

  test('Should centre the access refused page too', () => {
    const { container } = renderWizard({ allowed: false })

    expect(container.firstElementChild).toHaveClass('app-onboarding')
  })

  test('Should upper-case the slug and Jira key as they are typed', async () => {
    const { user } = renderWizard({ initialStep: 'details' })
    const slug = screen.getByLabelText(/^Project slug/)
    const jira = screen.getByLabelText(/^Jira project key/)

    await user.type(slug, 'crar')
    await user.type(jira, 'mmo_cr')

    expect(slug).toHaveValue('CRAR')
    expect(jira).toHaveValue('MMO_CR')
    for (const box of [slug, jira]) {
      expect(box).toHaveAttribute('autocapitalize', 'characters')
      expect(box).toHaveAttribute('spellcheck', 'false')
      expect(box).toHaveAttribute('autocomplete', 'off')
    }
  })

  test('Should keep the caret where it was when upper-casing mid-word', async () => {
    const { user } = renderWizard({ initialStep: 'details' })
    const slug = screen.getByLabelText(/^Project slug/)
    await user.type(slug, 'CR')

    await user.type(slug, 'a', {
      initialSelectionStart: 1,
      initialSelectionEnd: 1
    })

    expect(slug).toHaveValue('CAR')
    expect(slug.selectionStart).toBe(2)
  })

  test('Should never ask for capital letters', async () => {
    const { user } = renderWizard({ initialStep: 'details' })
    await user.type(screen.getByLabelText(/^Project slug/), 'a1')
    await user.type(screen.getByLabelText(/^Jira project key/), '1a')
    await save(user)

    expect(document.body.textContent).not.toMatch(/capital/i)
  })

  test('Should explain a slug that is the wrong length or has numbers', async () => {
    const { user } = renderWizard({ initialStep: 'details' })
    const slug = screen.getByLabelText(/^Project slug/)

    await user.type(slug, 'ab')
    await save(user)
    expect(slug).toHaveAccessibleDescription(/Slug must be 3 to 4 letters/)

    await user.clear(slug)
    await user.type(slug, 'ab1')
    await save(user)
    expect(slug).toHaveAccessibleDescription(
      /Slug must only contain letters, no numbers/
    )

    await user.clear(slug)
    await user.type(slug, 'abcde')
    await save(user)
    expect(slug).toHaveAccessibleDescription(/Slug must be 3 to 4 letters/)
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

const removeButton = (name) =>
  screen.queryByRole('button', { name: `Remove ${name}` })

const optionNames = () =>
  screen.queryAllByRole('option').map((option) => option.textContent)

const liveRegion = () =>
  within(document.querySelector('.govuk-form-group')).getByRole('status')

const expectAnnounced = (text) =>
  waitFor(() => expect(liveRegion()).toHaveTextContent(text), {
    timeout: ANNOUNCE_DELAY_MS + 1500
  })

describe('#OnboardingView repositories', () => {
  test('Should never show repositories as checkboxes or ask for a Sonar key', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.click(await repoInput())
    await screen.findAllByRole('option')

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByText(/sonar/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/sonar/i)).not.toBeInTheDocument()
  })

  test('Should offer one combobox with the list autocomplete pattern', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    const input = await repoInput()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-controls')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveClass('govuk-input')
    expect(input.className).not.toMatch(/--width-/)

    await user.click(input)

    expect(input).toHaveAttribute('aria-expanded', 'true')
    const listbox = await screen.findByRole('listbox', {
      name: 'Add a repository'
    })
    expect(input).toHaveAttribute('aria-controls', listbox.id)
  })

  test('Should list the repositories that are sending data but have no project', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    await user.click(await repoInput())

    expect(await screen.findAllByRole('option')).toHaveLength(2)
    expect(optionNames()).toStrictEqual(['DEFRA/new-a', 'DEFRA/new-b'])
    await expectAnnounced('2 repositories found')
  })

  test('Should filter the suggestions as the user types', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.click(await repoInput())
    await screen.findAllByRole('option')

    await user.keyboard('NEW-B')

    expect(optionNames()).toStrictEqual(['DEFRA/new-b', 'Add NEW-B'])
    await expectAnnounced('1 repository found')
  })

  test('Should say when nothing matches and offer to add what was typed', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.type(await repoInput(), 'DEFRA/zzz')

    expect(optionNames()).toStrictEqual(['Add DEFRA/zzz'])
    await expectAnnounced('No matching repositories, press Enter to add')
  })

  test('Should add a chosen suggestion to the list', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    await chooseRepository(user, 'DEFRA/new-a')

    expect(removeButton('DEFRA/new-a')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(await repoInput()).toHaveValue('')
    await user.click(await repoInput())
    expect(optionNames()).toStrictEqual(['DEFRA/new-b'])
  })

  test('Should add a new repository typed in full with Enter', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    await user.type(await repoInput(), ' DEFRA/typed-by-hand{Enter}')

    expect(removeButton('DEFRA/typed-by-hand')).toBeInTheDocument()
    expect(await repoInput()).toHaveValue('')
    expect(screen.getByText('Added DEFRA/typed-by-hand')).toBeInTheDocument()
  })

  test('Should add the typed value from the Add option', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.type(await repoInput(), 'DEFRA/typed')

    await user.click(screen.getByRole('option', { name: 'Add DEFRA/typed' }))

    expect(removeButton('DEFRA/typed')).toBeInTheDocument()
  })

  test('Should add several repositories', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    await chooseRepository(user, 'DEFRA/new-a')
    await user.type(await repoInput(), 'DEFRA/typed{Enter}')
    await chooseRepository(user, 'DEFRA/new-b')

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  test('Should refuse a name that is not owner/name next to the field', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    await user.type(await repoInput(), 'nonsense{Enter}')

    expect(await repoInput()).toHaveAccessibleDescription(
      /Error: Enter the repository as owner\/name, like DEFRA\/mmo-cr-pdf/
    )
    expect(await repoInput()).toHaveAttribute('aria-invalid', 'true')
    expect(await repoInput()).toHaveValue('nonsense')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  test('Should refuse a repository that already belongs to a project', async () => {
    const { user } = renderWizard()
    await toRepositories(user)

    await user.type(await repoInput(), 'defra/ALREADY-MAPPED{Enter}')

    expect(await repoInput()).toHaveAccessibleDescription(
      /defra\/ALREADY-MAPPED is already mapped to a project/
    )
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  test('Should ignore a repository that is already in the list', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await chooseRepository(user, 'DEFRA/new-a')

    await user.type(await repoInput(), 'defra/NEW-A{Enter}')

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(await repoInput()).toHaveValue('')
    expect(screen.getByText('defra/NEW-A is already added')).toBeInTheDocument()
  })

  test('Should remove an added repository and return to the field', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await chooseRepository(user, 'DEFRA/new-a')
    await chooseRepository(user, 'DEFRA/new-b')

    await user.click(screen.getByRole('button', { name: 'Remove DEFRA/new-a' }))

    expect(removeButton('DEFRA/new-a')).not.toBeInTheDocument()
    expect(removeButton('DEFRA/new-b')).toBeInTheDocument()
    expect(await repoInput()).toHaveFocus()
    expect(screen.getByText('Removed DEFRA/new-a')).toBeInTheDocument()
    await user.click(await repoInput())
    expect(optionNames()).toStrictEqual(['DEFRA/new-a'])
  })

  test('Should move through the options with the arrow keys', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    const input = await repoInput()
    await user.click(input)
    const [first, second] = await screen.findAllByRole('option')

    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(second).toHaveAttribute('aria-selected', 'false')

    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', second.id)

    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)

    await user.keyboard('{ArrowUp}')
    expect(input).toHaveAttribute('aria-activedescendant', second.id)
    expect(input).toHaveFocus()
  })

  test('Should open with the arrow keys and choose the active option with Enter', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    const input = await repoInput()
    await screen.findByText(/Choose a repository that is already sending data/)
    input.focus()

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Enter}')

    expect(removeButton('DEFRA/new-b')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  test('Should open from the last option with ArrowUp', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    const input = await repoInput()
    await screen.findByText(/Choose a repository that is already sending data/)
    input.focus()

    await user.keyboard('{ArrowUp}')

    const options = await screen.findAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
  })

  test('Should close the list with Escape, then clear the text', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.type(await repoInput(), 'new')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(await repoInput()).toHaveValue('new')

    await user.keyboard('{Escape}')

    expect(await repoInput()).toHaveValue('')
  })

  test('Should close the list when the field loses focus', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await user.click(await repoInput())
    await screen.findAllByRole('option')

    await user.tab()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  test('Should not submit the form when Enter adds a repository', async () => {
    const { user, callbacks } = renderWizard()
    await toRepositories(user)
    callbacks.onStepChange.mockClear()

    await user.type(await repoInput(), 'DEFRA/typed{Enter}')

    expect(callbacks.onStepChange).not.toHaveBeenCalled()
  })

  test('Should require at least one repository', async () => {
    const { user } = renderWizard()
    await toRepositories(user)
    await repoInput()

    await save(user)

    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: 'Add at least one repository'
      })
    ).toHaveAttribute('href', '#repository-input')
    expect(await repoInput()).toHaveAccessibleDescription(
      /Error: Add at least one repository/
    )
  })

  test('Should add a repository typed but not yet added when saving', async () => {
    const { user, callbacks } = renderWizard()
    await toRepositories(user)
    await user.type(await repoInput(), 'DEFRA/pending')

    await save(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    expect(
      within(taskItem('Connect Repositories')).getByText('Completed')
    ).toBeVisible()
  })

  test('Should refuse a typed repository that is invalid when saving', async () => {
    const { user, callbacks } = renderWizard()
    await toRepositories(user)
    callbacks.onStepChange.mockClear()
    await user.type(await repoInput(), 'nonsense')

    await save(user)

    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: /owner\/name/
      })
    ).toHaveAttribute('href', '#repository-input')
    expect(callbacks.onStepChange).not.toHaveBeenCalled()
  })

  test('Should say when the repositories cannot be loaded and still allow typing one', async () => {
    fetchMock.mockResponse(async () => ({ status: 500, body: '{}' }))
    const { user } = renderWizard()
    await toRepositories(user)

    expect(
      await screen.findByText(/We could not load the repositories that are/)
    ).toBeInTheDocument()

    await user.type(await repoInput(), 'DEFRA/typed{Enter}')

    expect(removeButton('DEFRA/typed')).toBeInTheDocument()
  })

  test('Should say when no repository is sending data without a project', async () => {
    backend({ unassigned: [] })
    const { user } = renderWizard()
    await toRepositories(user)

    expect(
      await screen.findByText(/^Type the repository as owner\/name/)
    ).toBeInTheDocument()
    await user.click(await repoInput())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.type(await repoInput(), 'DEFRA/typed{Enter}')

    expect(removeButton('DEFRA/typed')).toBeInTheDocument()
  })

  test('Should announce that repositories are loading', async () => {
    fetchMock.mockResponse(() => new Promise(() => {}))
    const { user } = renderWizard()
    await toRepositories(user)

    expect(
      await screen.findByText('Loading repositories that are sending data…')
    ).toHaveAttribute('role', 'status')
  })

  test('Should return to the task list with the choice kept', async () => {
    const { user, callbacks } = renderWizard()
    await completeDetails(user)
    await completeRepositories(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    await openTask(user, 'Connect Repositories')
    expect(
      await screen.findByRole('button', { name: 'Remove DEFRA/new-a' })
    ).toBeInTheDocument()
  })

  test('Should go back to the task list without saving', async () => {
    const { user, callbacks } = renderWizard()
    await toRepositories(user)
    await repoInput()

    await backToTasks(user)

    expect(callbacks.onStepChange).toHaveBeenLastCalledWith(undefined)
    expect(
      within(taskItem('Connect Repositories')).getByText('Not started')
    ).toBeVisible()
  })

  test('Should have no accessibility violations', async () => {
    const { container, user } = renderWizard()
    await toRepositories(user)
    expect(await axeViolations(container)).toStrictEqual([])

    await user.click(await repoInput())
    await screen.findAllByRole('option')
    await user.keyboard('{ArrowDown}')
    expect(await axeViolations(container)).toStrictEqual([])

    await user.keyboard('{Enter}')
    expect(await axeViolations(container)).toStrictEqual([])

    await user.type(await repoInput(), 'nonsense{Enter}')
    expect(await axeViolations(container)).toStrictEqual([])

    await user.clear(await repoInput())
    await save(user)
    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#OnboardingView review', () => {
  test('Should summarise the answers in cards', async () => {
    const { user } = renderWizard()
    await toRepositories(user, { type: 'AI-Adopted', jira: 'mmocr' })
    await chooseRepository(user, 'DEFRA/new-a')
    await user.type(await repoInput(), 'DEFRA/typed-by-hand{Enter}')
    await save(user)
    await openTask(user, 'Review and Onboard Project')

    const details = (
      await screen.findByRole('heading', { level: 2, name: 'Project Details' })
    ).closest('.govuk-summary-card')
    expect(within(details).getByText('New Service')).toBeInTheDocument()
    expect(within(details).getByText('NSVC')).toBeInTheDocument()
    expect(within(details).getByText('AI-Adopted')).toBeInTheDocument()
    expect(within(details).getByText('1 October 2025')).toBeInTheDocument()
    expect(within(details).getByText('Jira project key')).toBeInTheDocument()
    expect(within(details).getByText('MMOCR')).toBeInTheDocument()

    const repos = screen
      .getByRole('heading', { level: 2, name: 'Repositories' })
      .closest('.govuk-summary-card')
    expect(within(repos).getByText('DEFRA/new-a')).toBeInTheDocument()
    expect(within(repos).getByText('DEFRA/typed-by-hand')).toBeInTheDocument()
    expect(screen.queryByText(/sonar/i)).not.toBeInTheDocument()
    expect(document.title).toBe(
      'Review and Onboard Project – Onboard a Project – Copilot Delivery Insights'
    )
  })

  test('Should show no adoption date but the Jira key for an AI-Native project', async () => {
    const { user } = renderWizard()
    await reachReview(user)

    expect(screen.queryByText('Adoption start date')).not.toBeInTheDocument()
    expect(screen.getByText('AI-Native')).toBeInTheDocument()
    expect(screen.getByText('MMOCR')).toBeInTheDocument()
  })

  test('Should show None for an AI-Adopted project with no Jira key', async () => {
    const { user } = renderWizard()
    await reachReview(user, { details: { type: 'AI-Adopted' } })

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
      await screen.findByRole('button', { name: 'Remove DEFRA/new-a' })
    ).toBeInTheDocument()
    await chooseRepository(user, 'DEFRA/new-b')
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

  test('Should drop an adoption date typed before switching to AI-Native', async () => {
    const { user } = renderWizard()
    await openTask(user, 'Project Details')
    await user.type(screen.getByLabelText('Project name'), 'New Service')
    await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')
    await user.click(screen.getByLabelText('AI-Adopted'))
    await user.type(screen.getByLabelText('Day'), '99')
    await user.click(screen.getByLabelText('AI-Native'))
    await user.type(screen.getByLabelText('Jira project key'), 'MMOCR')
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
    await reachReview(user, { details: { type: 'AI-Adopted' } })

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#OnboardingView submission', () => {
  test('Should create the project, connect the repositories and confirm', async () => {
    const { user, callbacks } = renderWizard()
    await toRepositories(user, { type: 'AI-Adopted', jira: 'MMOCR' })
    await chooseRepository(user, 'DEFRA/new-a')
    await user.type(await repoInput(), 'DEFRA/typed-by-hand{Enter}')
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
    const mapping = puts.find(([url]) => url.endsWith('new-a'))
    expect(JSON.parse(mapping[1].body)).toStrictEqual({ projectSlug: 'NSVC' })
    expect(mapping[1].headers['x-requested-with']).toBe('XMLHttpRequest')
    for (const [, init] of puts) {
      expect(JSON.parse(init.body)).not.toHaveProperty('sonarProjectKey')
    }
    expect(callbacks.onProjectCreated).toHaveBeenCalledWith('NSVC')
    expect(callbacks.onStepChange).toHaveBeenLastCalledWith('confirmation')

    const table = screen.getByRole('table', { name: 'Connected repositories' })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(1)
    expect(within(table).getByText('DEFRA/new-a')).toBeInTheDocument()
    expect(within(table).getByText('DEFRA/typed-by-hand')).toBeInTheDocument()
    expect(screen.queryByText(/sonar/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/could not be connected/)).not.toBeInTheDocument()
    expect(heading('What Happens Next', 2)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Help page' })).toHaveAttribute(
      'href',
      '#/help'
    )
  })

  test('Should send the single Jira key, upper-cased, as a one element list', async () => {
    const { user } = renderWizard()
    await reachReview(user, { details: { jira: 'mmocr' } })

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))
    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })

    const [, init] = writes('POST')[0]
    expect(JSON.parse(init.body).jira).toStrictEqual({ projectKeys: ['MMOCR'] })
  })

  test('Should send an empty list when there is no Jira key', async () => {
    const { user } = renderWizard()
    await reachReview(user, { details: { type: 'AI-Adopted' } })

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))
    await screen.findByRole('heading', { level: 1, name: 'Project Onboarded' })

    const [, init] = writes('POST')[0]
    expect(JSON.parse(init.body).jira).toStrictEqual({ projectKeys: [] })
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

  test('Should send the user back to the details with the slug error when the slug is taken', async () => {
    let attempts = 0
    backend({
      post: () => {
        attempts += 1
        return attempts === 1
          ? {
              status: 409,
              body: jsonOf({
                statusCode: 409,
                error: 'Conflict',
                message: 'That project slug is already in use'
              })
            }
          : jsonOf({})
      }
    })
    const { user, container } = renderWizard()
    await reachReview(user)

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Project Details' })
    ).toBeInTheDocument()
    const message =
      'That project slug is already in use. Choose a different slug.'
    const summary = screen.getByRole('alert')
    expect(summary.closest('.govuk-error-summary')).toHaveFocus()
    expect(
      within(summary).getByRole('link', { name: message })
    ).toHaveAttribute('href', '#project-slug')
    const slug = screen.getByLabelText(/^Project slug/)
    expect(slug).toHaveAccessibleDescription(
      expect.stringContaining(`Error: ${message}`)
    )
    expect(slug).toHaveValue('NSVC')
    expect(writes('PUT')).toHaveLength(0)
    expect(await axeViolations(container)).toStrictEqual([])

    await user.clear(slug)
    await user.type(slug, 'NSVD')
    await save(user)
    await openTask(user, 'Review and Onboard Project')
    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Project Onboarded'
      })
    ).toBeInTheDocument()
    expect(JSON.parse(writes('POST')[1][1].body).slug).toBe('NSVD')
  })

  test.each([
    'AI-Native projects require exactly one Jira project key',
    'The Jira project key cannot be changed'
  ])(
    'Should show the backend Jira key message "%s" on the Jira key field',
    async (message) => {
      backend({
        post: () => ({
          status: 400,
          body: jsonOf({ statusCode: 400, error: 'Bad Request', message })
        })
      })
      const { user } = renderWizard()
      await reachReview(user)

      await user.click(screen.getByRole('button', { name: 'Onboard project' }))

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Project Details'
        })
      ).toBeInTheDocument()
      expect(
        within(screen.getByRole('alert')).getByRole('link', { name: message })
      ).toHaveAttribute('href', '#project-jira-key')
      expect(
        screen.getByLabelText(/^Jira project key/)
      ).toHaveAccessibleDescription(
        expect.stringContaining(`Error: ${message}`)
      )
    }
  )

  test.each([
    [
      400,
      'Invalid request input',
      'Some of the information was not accepted. Check your answers and try again.'
    ],
    [403, 'Admin role required', 'You do not have permission to do this']
  ])(
    'Should stay on the review with a friendly message for a %i',
    async (status, message, shown) => {
      backend({ post: () => ({ status, body: jsonOf({ message }) }) })
      const { user } = renderWizard()
      await reachReview(user)

      await user.click(screen.getByRole('button', { name: 'Onboard project' }))

      expect(
        await within(await screen.findByRole('alert')).findByText(shown)
      ).toBeInTheDocument()
      expect(screen.queryByText(message)).not.toBeInTheDocument()
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Review and Onboard Project'
        })
      ).toBeInTheDocument()
    }
  )

  test('Should keep the existing message when the request never reaches the BFF', async () => {
    backend({
      post: () => {
        throw new Error('offline')
      }
    })
    const { user } = renderWizard()
    await reachReview(user)

    await user.click(screen.getByRole('button', { name: 'Onboard project' }))

    expect(
      await within(await screen.findByRole('alert')).findByText(
        'The project could not be added'
      )
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
    expect(screen.getByLabelText('AI-Native')).not.toBeChecked()
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
