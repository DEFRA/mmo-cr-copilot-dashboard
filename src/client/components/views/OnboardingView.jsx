import { useEffect, useRef, useState } from 'react'

import {
  BackLink,
  Button,
  Combobox,
  DateInput,
  ErrorSummary,
  InsetText,
  Radios,
  SummaryCard,
  Table,
  TaskList,
  TextInput,
  WarningText
} from '../govuk'
import { isPlainClick } from '../govuk/utils.js'
import { useRepositories } from '../../hooks/useRepositories'
import { jsonWrite } from '../../lib/api'
import { ensureOk, readApiError, toApiError } from '../../lib/api-errors'
import {
  EMPTY_DETAILS,
  addRepository,
  formatDate,
  isRepositoryName,
  jiraKeyField,
  parseDate,
  toProjectRequest,
  toRepositoryMappings,
  typeLabel,
  validateProject,
  validateRepositories
} from '../../lib/onboarding'
import { toHash } from '../../lib/routes'

const SERVICE_NAME = 'Copilot Delivery Insights'

const TITLES = {
  tasks: 'Onboard a Project',
  details: 'Project Details',
  repositories: 'Connect Repositories',
  check: 'Review and Onboard Project',
  confirmation: 'Project Onboarded'
}

const TYPE_ITEMS = [
  {
    value: 'ai-adopted',
    text: 'AI-Adopted',
    hint: 'An existing team adopting GitHub Copilot.'
  },
  {
    value: 'ai-native',
    text: 'AI-Native',
    hint: 'A team building with an agentic delivery lifecycle from the start.'
  }
]

const DETAIL_FIELDS = {
  name: 'project-name',
  slug: 'project-slug',
  type: 'project-type',
  adoption: 'project-adoption-day',
  jiraKey: 'project-jira-key'
}

const hasErrors = (errors) => Object.keys(errors).length > 0
// The task list is the route with no step.
const stepHash = (step) =>
  toHash({ level: 'onboarding', step: step === 'tasks' ? undefined : step })

// An AI-Native project has no adoption date, whatever was typed before
// switching. The slug and Jira key are upper-cased defensively.
const settled = (details) => ({
  ...details,
  slug: details.slug.toUpperCase(),
  jiraKey: details.jiraKey.trim().toUpperCase(),
  ...(details.type === 'ai-native' && { adoption: EMPTY_DETAILS.adoption })
})

// Upper-case what is typed without moving the caret.
function upperCased(event) {
  const input = event.target
  const { selectionStart, selectionEnd } = input
  input.value = input.value.toUpperCase()
  input.setSelectionRange(selectionStart, selectionEnd)
  return input.value
}

const COMPLETED = { text: 'Completed', tag: true, colour: 'green' }
const IN_PROGRESS = { text: 'In progress', tag: true, colour: 'light-blue' }
const NOT_STARTED = { text: 'Not started', tag: true, colour: 'blue' }
const READY = { text: 'Ready', tag: true, colour: 'blue' }
const CANNOT_START = { text: 'Cannot start yet' }

function progress(complete, started) {
  if (complete) return COMPLETED
  return started ? IN_PROGRESS : NOT_STARTED
}

// A task opens only once the earlier ones are done; a link to it is refused too.
function resolveStep(requested, { result, detailsOk, reposOk }) {
  if (result) return 'confirmation'
  if (requested === 'details') return 'details'
  if (requested === 'repositories') return detailsOk ? 'repositories' : 'tasks'
  if (requested === 'check') return detailsOk && reposOk ? 'check' : 'tasks'
  return 'tasks'
}

const PROJECT_FAILED = 'The project could not be added'

async function createProject(details) {
  const res = await jsonWrite(
    '/api/projects',
    'POST',
    toProjectRequest(details)
  )
  await ensureOk(res, { context: 'project', fallback: PROJECT_FAILED })
}

async function connectRepository({ fullName, body }) {
  const fallback = `${fullName} could not be connected`
  try {
    const res = await jsonWrite(
      `/api/repositories/${encodeURIComponent(fullName)}`,
      'PUT',
      body
    )
    if (res.ok) return { fullName }
    const { message } = await readApiError(res, { fallback })
    return {
      fullName,
      error: message.includes(fullName) ? message : `${fullName}: ${message}`
    }
  } catch {
    return { fullName, error: fallback }
  }
}

// A details answer the backend refused stays an error until it is changed.
function withRejected(errors, project, rejected) {
  const found = { ...errors }
  for (const [key, { value, text }] of Object.entries(rejected)) {
    if (!found[key] && project[key] === value) found[key] = text
  }
  return found
}

function DetailsStep({ details, rejected, onChange, onContinue }) {
  const [errors, setErrors] = useState(() =>
    withRejected({}, settled(details), rejected)
  )
  const [attempt, setAttempt] = useState(0)
  const set = (key) => (value) => onChange({ ...details, [key]: value })
  const jiraField = jiraKeyField(details.type)

  // The Jira key rule follows the type, so an error shown for it is re-checked.
  const handleType = (type) => {
    set('type')(type)
    if (!errors.jiraKey) return
    const { jiraKey } = withRejected(
      validateProject(settled({ ...details, type })),
      settled({ ...details, type }),
      rejected
    )
    setErrors((current) => {
      const next = { ...current }
      delete next.jiraKey
      return jiraKey ? { ...next, jiraKey } : next
    })
  }
  const handleSubmit = (event) => {
    event.preventDefault()
    const project = settled(details)
    const found = withRejected(validateProject(project), project, rejected)
    setErrors(found)
    setAttempt((a) => a + 1)
    if (!hasErrors(found)) onContinue()
  }

  const errorList = Object.keys(DETAIL_FIELDS)
    .filter((key) => errors[key])
    .map((key) => ({ href: `#${DETAIL_FIELDS[key]}`, text: errors[key] }))

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
      )}
      <TextInput
        id="project-name"
        label="Project name"
        labelSize="s"
        errorMessage={errors.name}
        value={details.name}
        onChange={(event) => set('name')(event.target.value)}
      />
      <TextInput
        id="project-slug"
        label="Project slug"
        labelSize="s"
        hint="Used in links. 3 or 4 letters, like CRAR."
        errorMessage={errors.slug}
        autoCapitalize="characters"
        spellCheck={false}
        autoComplete="off"
        value={details.slug}
        onChange={(event) => set('slug')(upperCased(event))}
      />
      <Radios
        idPrefix="project-type"
        name="project-type"
        legend="Project type"
        legendSize="s"
        errorMessage={errors.type}
        items={TYPE_ITEMS}
        value={details.type}
        onChange={handleType}
      />
      {details.type === 'ai-adopted' && (
        <DateInput
          id="project-adoption"
          legend="Adoption start date"
          legendSize="s"
          hint="The date the team started using Copilot. For example, 1 10 2025."
          errorMessage={errors.adoption}
          value={details.adoption}
          onChange={set('adoption')}
        />
      )}
      <TextInput
        id="project-jira-key"
        label={jiraField.label}
        labelSize="s"
        hint={jiraField.hint}
        errorMessage={errors.jiraKey}
        autoCapitalize="characters"
        spellCheck={false}
        autoComplete="off"
        value={details.jiraKey}
        onChange={(event) => set('jiraKey')(upperCased(event))}
      />
      <Button type="submit">Save and continue</Button>
    </form>
  )
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase()

function RepositoriesStep({
  suggestions,
  status,
  selected,
  onSelect,
  mapped,
  onContinue
}) {
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const inputRef = useRef(null)

  const options = suggestions.filter(
    (name) => !selected.some((added) => sameName(added, name))
  )
  const hint = [
    suggestions.length > 0
      ? 'Choose a repository that is already sending data, or type a new one as owner/name, like DEFRA/mmo-cr-pdf, and press Enter.'
      : 'Type the repository as owner/name, like DEFRA/mmo-cr-pdf, and press Enter.',
    'Map a repository before adding the analytics workflow to it.'
  ].join(' ')

  const add = (text, fromSubmit = false) => {
    const result = addRepository(selected, text, mapped)
    if (result.error) {
      setError({ text: result.error, summary: fromSubmit })
      return result
    }
    setError(null)
    setQuery('')
    onSelect(result.list)
    setNotice(
      result.duplicate
        ? `${result.name} is already added`
        : `Added ${result.name}`
    )
    return result
  }

  const remove = (name) => {
    onSelect(selected.filter((added) => added !== name))
    setNotice(`Removed ${name}`)
    inputRef.current?.focus()
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    let list = selected
    if (query.trim()) {
      const result = add(query, true)
      if (result.error) {
        setAttempt((a) => a + 1)
        return
      }
      list = result.list
    }
    const found = validateRepositories(list, mapped)
    setError(found.list ? { text: found.list, summary: true } : null)
    setAttempt((a) => a + 1)
    if (!hasErrors(found)) onContinue()
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error?.summary && (
        <ErrorSummary
          key={attempt}
          errors={[{ href: '#repository-input', text: error.text }]}
        />
      )}
      {status === 'loading' && (
        <p className="govuk-body" role="status">
          Loading repositories that are sending data…
        </p>
      )}
      {status === 'error' && (
        <InsetText>
          We could not load the repositories that are sending data. You can
          still add one below.
        </InsetText>
      )}
      <Combobox
        id="repository-input"
        label="Add a repository"
        labelSize="s"
        hint={hint}
        errorMessage={error?.text}
        value={query}
        onChange={setQuery}
        options={options}
        onSelect={(text) => add(text)}
        allowCustom
        itemName="repository"
        itemNamePlural="repositories"
        inputRef={inputRef}
      />
      <h2 className="govuk-heading-s">Repositories to Connect</h2>
      {selected.length === 0 ? (
        <p className="govuk-body">No repositories added yet.</p>
      ) : (
        <ul className="app-repo-list">
          {selected.map((name) => (
            <li className="app-repo-list__item" key={name}>
              {name}
              <button
                type="button"
                className="app-link-button app-repo-list__remove"
                onClick={() => remove(name)}
              >
                Remove <span className="govuk-visually-hidden">{name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="govuk-visually-hidden" aria-live="polite">
        {notice}
      </div>
      <Button type="submit">Save and continue</Button>
    </form>
  )
}

function CheckStep({
  details,
  repositories,
  submitError,
  saving,
  changeLink,
  onSubmit
}) {
  const date = parseDate(details.adoption)
  const detailRows = [
    { key: 'Project name', value: details.name.trim() },
    { key: 'Project slug', value: details.slug },
    { key: 'Project type', value: typeLabel(details.type) },
    ...(details.type === 'ai-adopted'
      ? [
          {
            key: 'Adoption start date',
            value: date ? formatDate(date.toISOString()) : 'Not set'
          }
        ]
      : []),
    {
      key: 'Jira project key',
      value: details.jiraKey || 'None'
    }
  ]
  const repositoryRows = repositories.map((fullName) => ({
    id: fullName,
    key: 'Repository',
    value: fullName
  }))

  return (
    <>
      {submitError && (
        <ErrorSummary errors={[{ text: submitError }]} key={submitError} />
      )}
      <SummaryCard
        title="Project Details"
        actions={[changeLink('details')]}
        rows={detailRows}
      />
      <SummaryCard
        title="Repositories"
        actions={[changeLink('repositories')]}
        rows={repositoryRows}
      />
      <Button onClick={onSubmit} disabled={saving}>
        Onboard project
      </Button>
      {saving && (
        <p className="govuk-body" role="status">
          Onboarding the project…
        </p>
      )}
    </>
  )
}

function TaskListStep({ items, completed, headingRef }) {
  return (
    <>
      <h1 className="govuk-heading-xl" ref={headingRef} tabIndex={-1}>
        {TITLES.tasks}
      </h1>
      <p className="govuk-body">
        Complete each task, then review and onboard the project.
      </p>
      <p className="govuk-body">
        You have completed {completed} of {items.length} tasks.
      </p>
      <TaskList items={items} idPrefix="onboarding-task" />
    </>
  )
}

function ConfirmationStep({ result, headingRef, onLaunch, onAnother }) {
  const { connected, failed } = result
  const count = failed.length

  return (
    <>
      <div className="govuk-panel govuk-panel--confirmation">
        <h1 className="govuk-panel__title" ref={headingRef} tabIndex={-1}>
          Project Onboarded
        </h1>
        <div className="govuk-panel__body">
          {result.name}
          <br />
          <strong>{result.slug}</strong>
        </div>
      </div>

      {count > 0 && (
        <>
          <WarningText iconFallbackText="Warning">
            {count === 1
              ? '1 repository could not be connected'
              : `${count} repositories could not be connected`}
          </WarningText>
          <ul className="govuk-list govuk-list--bullet">
            {failed.map((row) => (
              <li key={row.fullName}>{row.error}</li>
            ))}
          </ul>
          <p className="govuk-body">
            The project was created. Connect these repositories in Settings,
            under Repositories, before adding the analytics workflow to them.
          </p>
        </>
      )}

      {connected.length > 0 && (
        <>
          <h2 className="govuk-heading-m">Connected Repositories</h2>
          <Table
            caption="Connected repositories"
            captionHidden
            head={[{ id: 'repo', label: 'Repository' }]}
            rows={connected.map((row) => ({
              id: row.fullName,
              cells: [row.fullName]
            }))}
          />
        </>
      )}

      <h2 className="govuk-heading-m">What Happens Next</h2>
      <ol className="govuk-list govuk-list--number">
        <li>
          Add the analytics workflow to each repository. The{' '}
          <a className="govuk-link" href={toHash({ level: 'help' })}>
            Help page
          </a>{' '}
          has the workflow and the settings to use.
        </li>
        <li>
          Map Entra groups to Project Admin and Project User in Settings, under
          Role Mappings, so that people can see the project.
        </li>
        <li>
          Open or update a pull request. It shows on the project overview once
          the workflow has published it.
        </li>
      </ol>

      <div className="govuk-button-group">
        <Button onClick={() => onLaunch?.(result.slug)}>
          Launch project overview
        </Button>
        <Button variant="secondary" onClick={onAnother}>
          Onboard another project
        </Button>
      </div>
    </>
  )
}

/**
 * Onboard a project through a task list: its details, the repositories that
 * feed it, then a review that creates it. Entered answers are kept while the
 * tasks are done in any order the list allows, and a project is only ever
 * created once.
 */
export function OnboardingView({
  allowed = false,
  step,
  onStepChange,
  onProjectCreated,
  onLaunch,
  onNavigateHome
}) {
  const { repositories, unassigned, status, refresh } = useRepositories(allowed)
  const [details, setDetails] = useState(EMPTY_DETAILS)
  const [selected, setSelected] = useState([])
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [rejected, setRejected] = useState({})
  const submitting = useRef(false)
  const headingRef = useRef(null)
  const mounted = useRef(false)
  const summaryTakesFocus = useRef(false)

  const suggestions = unassigned.filter(isRepositoryName)
  const project = settled(details)
  const mapped = repositories.map((r) => r.fullName)
  const detailsOk = !hasErrors(
    withRejected(validateProject(project), project, rejected)
  )
  const reposOk = !hasErrors(validateRepositories(selected, mapped))
  const current = resolveStep(step, { result, detailsOk, reposOk })

  useEffect(() => {
    const page =
      current === 'tasks'
        ? TITLES.tasks
        : `${TITLES[current]} – ${TITLES.tasks}`
    document.title = `${allowed ? page : 'Access Refused'} – ${SERVICE_NAME}`
  }, [allowed, current])

  // Move focus to the new step's heading, but not when the page first opens
  // or when an error summary has already taken it.
  useEffect(() => {
    if (mounted.current && !summaryTakesFocus.current) {
      headingRef.current?.focus()
    }
    mounted.current = true
    summaryTakesFocus.current = false
  }, [current])

  if (!allowed) {
    return (
      <div className="app-onboarding">
        <BackLink
          href={toHash({ level: 'overview' })}
          onClick={onNavigateHome}
          className="govuk-!-margin-bottom-6"
        >
          Back to overview
        </BackLink>
        <h1 className="govuk-heading-xl">You Cannot Onboard Projects</h1>
        <p className="govuk-body">
          You need the Dashboard Admin role to onboard a project.
        </p>
        <p className="govuk-body">
          If you think you should be able to, ask a dashboard admin or the
          service team.
        </p>
      </div>
    )
  }

  const go = (target) => {
    onStepChange?.(target === 'tasks' ? undefined : target)
  }

  const stepLink = (target) => ({
    href: stepHash(target),
    onClick: (event) => {
      if (!isPlainClick(event)) return
      event.preventDefault()
      go(target)
    }
  })

  const changeLink = (target) => ({ text: 'Change', ...stepLink(target) })

  const detailsStarted =
    JSON.stringify(details) !== JSON.stringify(EMPTY_DETAILS)
  const reposStarted = selected.length > 0
  const taskItems = [
    {
      title: TITLES.details,
      hint: 'Name, slug, type, adoption date and Jira key',
      ...stepLink('details'),
      status: progress(detailsOk, detailsStarted)
    },
    {
      title: TITLES.repositories,
      hint: 'The repositories that send data to the project',
      ...(detailsOk ? stepLink('repositories') : {}),
      status: detailsOk ? progress(reposOk, reposStarted) : CANNOT_START
    },
    {
      title: TITLES.check,
      hint: 'Check your answers and create the project',
      ...(detailsOk && reposOk ? stepLink('check') : {}),
      status: detailsOk && reposOk ? READY : CANNOT_START
    }
  ]
  const completed = taskItems.filter((item) => item.status === COMPLETED).length

  const back = current === 'tasks' ? null : stepLink('tasks')

  const handleSubmit = async () => {
    if (submitting.current || result) return
    submitting.current = true
    setSaving(true)
    setSubmitError(null)
    try {
      await createProject(project)
      const outcomes = await Promise.all(
        toRepositoryMappings(project.slug, selected).map(connectRepository)
      )
      await onProjectCreated?.(project.slug)
      refresh()
      setResult({
        slug: project.slug,
        name: project.name.trim(),
        connected: outcomes.filter((row) => !row.error),
        failed: outcomes.filter((row) => row.error)
      })
      go('confirmation')
    } catch (err) {
      const error = toApiError(err, PROJECT_FAILED)
      if (error.field && DETAIL_FIELDS[error.field]) {
        setRejected((current) => ({
          ...current,
          [error.field]: { value: project[error.field], text: error.message }
        }))
        summaryTakesFocus.current = true
        go('details')
      } else {
        setSubmitError(error.message)
      }
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  const handleAnother = () => {
    setDetails(EMPTY_DETAILS)
    setSelected([])
    setResult(null)
    setSubmitError(null)
    setRejected({})
    go('tasks')
  }

  return (
    <div className="app-onboarding">
      {current === 'confirmation' ? (
        <ConfirmationStep
          result={result}
          headingRef={headingRef}
          onLaunch={onLaunch}
          onAnother={handleAnother}
        />
      ) : (
        <>
          {back ? (
            <BackLink {...back} className="govuk-!-margin-bottom-6">
              Back to task list
            </BackLink>
          ) : (
            <BackLink
              href={toHash({ level: 'overview' })}
              onClick={onNavigateHome}
              className="govuk-!-margin-bottom-6"
            >
              Back to overview
            </BackLink>
          )}
          {current === 'tasks' ? (
            <TaskListStep
              items={taskItems}
              completed={completed}
              headingRef={headingRef}
            />
          ) : (
            <>
              <span className="govuk-caption-l">{TITLES.tasks}</span>
              <h1 className="govuk-heading-xl" ref={headingRef} tabIndex={-1}>
                {TITLES[current]}
              </h1>
            </>
          )}
          {current === 'details' && (
            <DetailsStep
              details={details}
              rejected={rejected}
              onChange={setDetails}
              onContinue={() => go('tasks')}
            />
          )}
          {current === 'repositories' && (
            <RepositoriesStep
              suggestions={suggestions}
              status={status}
              selected={selected}
              onSelect={setSelected}
              mapped={mapped}
              onContinue={() => go('tasks')}
            />
          )}
          {current === 'check' && (
            <CheckStep
              details={project}
              repositories={selected}
              submitError={submitError}
              saving={saving}
              changeLink={changeLink}
              onSubmit={handleSubmit}
            />
          )}
        </>
      )}
    </div>
  )
}
