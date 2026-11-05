import { useEffect, useRef, useState } from 'react'

import {
  BackLink,
  Button,
  Checkboxes,
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
import {
  EMPTY_DETAILS,
  EMPTY_REPOSITORIES,
  formatDate,
  isRepositoryName,
  parseDate,
  splitKeys,
  toProjectRequest,
  toRepositoryMappings,
  typeLabel,
  validateProject,
  validateRepositories
} from '../../lib/onboarding'
import { toHash } from '../../lib/routes'

const SERVICE_NAME = 'Copilot Delivery Insights'
const EMPTY_MANUAL = EMPTY_REPOSITORIES[0]

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
    text: 'AI-adopted',
    hint: 'An existing team adopting GitHub Copilot.'
  },
  {
    value: 'ai-native',
    text: 'AI-native',
    hint: 'A team building with an agentic delivery lifecycle from the start.'
  }
]

const DETAIL_FIELDS = {
  name: 'project-name',
  slug: 'project-slug',
  type: 'project-type',
  adoption: 'project-adoption-day',
  jiraKeys: 'project-jira-keys'
}

const hasErrors = (errors) => Object.keys(errors).length > 0
// The task list is the route with no step.
const stepHash = (step) =>
  toHash({ level: 'onboarding', step: step === 'tasks' ? undefined : step })

// An AI-native project has no adoption date, whatever was typed before switching.
const settled = (details) =>
  details.type === 'ai-native'
    ? { ...details, adoption: EMPTY_DETAILS.adoption }
    : details

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

async function failureMessage(res, fallback) {
  const body = await res.json().catch(() => null)
  return typeof body?.message === 'string' && body.message
    ? body.message
    : fallback
}

async function createProject(details) {
  const res = await jsonWrite(
    '/api/projects',
    'POST',
    toProjectRequest(details)
  )
  if (!res.ok) {
    throw new Error(await failureMessage(res, 'The project could not be added'))
  }
}

async function connectRepository({ fullName, body }) {
  const fallback = `${fullName} could not be connected`
  try {
    const res = await jsonWrite(
      `/api/repositories/${encodeURIComponent(fullName)}`,
      'PUT',
      body
    )
    if (!res.ok) return { fullName, error: await failureMessage(res, fallback) }
    return { fullName, sonarProjectKey: body.sonarProjectKey ?? '' }
  } catch {
    return { fullName, error: fallback }
  }
}

function DetailsStep({ details, onChange, onContinue }) {
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const set = (key) => (value) => onChange({ ...details, [key]: value })

  const handleSubmit = (event) => {
    event.preventDefault()
    const found = validateProject(settled(details))
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
        hint="Used in links. 3 or 4 capital letters or numbers, like CRAR."
        errorMessage={errors.slug}
        width="20"
        spellCheck={false}
        autoComplete="off"
        value={details.slug}
        onChange={(event) => set('slug')(event.target.value)}
      />
      <Radios
        idPrefix="project-type"
        name="project-type"
        legend="Project type"
        legendSize="s"
        errorMessage={errors.type}
        items={TYPE_ITEMS}
        value={details.type}
        onChange={set('type')}
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
        id="project-jira-keys"
        label="Jira project keys (optional)"
        labelSize="s"
        hint="Separate keys with commas, like MMOCR, FES."
        errorMessage={errors.jiraKeys}
        width="20"
        spellCheck={false}
        autoComplete="off"
        value={details.jiraKeys}
        onChange={(event) => set('jiraKeys')(event.target.value)}
      />
      <Button type="submit">Save and continue</Button>
    </form>
  )
}

function RepositoriesStep({
  suggestions,
  status,
  selected,
  onSelect,
  sonarKeys,
  onSonarKey,
  manual,
  onManual,
  rows,
  mapped,
  onContinue
}) {
  const [attempt, setAttempt] = useState(0)
  const [errors, setErrors] = useState({})
  const rowErrors = errors.rows ?? {}
  const manualIndex = selected.length

  const handleSubmit = (event) => {
    event.preventDefault()
    const found = validateRepositories(rows, mapped)
    setErrors(found)
    setAttempt((a) => a + 1)
    if (!hasErrors(found)) onContinue()
  }

  const sonarId = (name) => `sonar-key-${suggestions.indexOf(name)}`
  const errorList = [
    errors.list && {
      href:
        suggestions.length > 0 ? '#repository-select' : '#manual-repository',
      text: errors.list
    },
    ...selected
      .map((name, index) => ({ name, found: rowErrors[index] }))
      .filter(({ found }) => found?.sonarProjectKey)
      .map(({ name, found }) => ({
        href: `#${sonarId(name)}`,
        text: `${name}: ${found.sonarProjectKey}`
      })),
    rowErrors[manualIndex]?.fullName && {
      href: '#manual-repository',
      text: rowErrors[manualIndex].fullName
    },
    rowErrors[manualIndex]?.sonarProjectKey && {
      href: '#manual-sonar-key',
      text: rowErrors[manualIndex].sonarProjectKey
    }
  ].filter(Boolean)

  const items = suggestions.map((name) => ({
    value: name,
    text: name,
    conditional: (
      <TextInput
        id={sonarId(name)}
        label="SonarCloud project key (optional)"
        hint={`For ${name}. Leave blank if it has no SonarCloud project.`}
        width="30"
        spellCheck={false}
        autoComplete="off"
        errorMessage={rowErrors[selected.indexOf(name)]?.sonarProjectKey}
        value={sonarKeys[name] ?? ''}
        onChange={(event) => onSonarKey(name, event.target.value)}
      />
    )
  }))

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
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
      {suggestions.length > 0 && (
        <Checkboxes
          idPrefix="repository-select"
          name="repository-select"
          legend="Repositories sending data"
          legendSize="s"
          hint="These repositories are sending data but are not in a project yet. Select any that belong to this one."
          errorMessage={errors.list}
          items={items}
          value={selected}
          onChange={onSelect}
        />
      )}
      {status === 'success' && suggestions.length === 0 && (
        <p className="govuk-body">
          No repository is sending data without a project. Add the repository
          below.
        </p>
      )}
      <TextInput
        id="manual-repository"
        label="Another repository (optional)"
        labelSize="s"
        hint="As owner/name, like DEFRA/mmo-cr-pdf. Map a repository before adding the analytics workflow to it."
        errorMessage={
          rowErrors[manualIndex]?.fullName ??
          (suggestions.length === 0 ? errors.list : undefined)
        }
        width="30"
        spellCheck={false}
        autoComplete="off"
        value={manual.fullName}
        onChange={(event) =>
          onManual({ ...manual, fullName: event.target.value })
        }
      />
      <TextInput
        id="manual-sonar-key"
        label="SonarCloud project key for that repository (optional)"
        labelSize="s"
        errorMessage={rowErrors[manualIndex]?.sonarProjectKey}
        width="30"
        spellCheck={false}
        autoComplete="off"
        value={manual.sonarProjectKey}
        onChange={(event) =>
          onManual({ ...manual, sonarProjectKey: event.target.value })
        }
      />
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
  const jiraKeys = splitKeys(details.jiraKeys)
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
      key: 'Jira project keys',
      value: jiraKeys.length > 0 ? jiraKeys.join(', ') : 'None'
    }
  ]
  const repositoryRows = repositories.map((row) => ({
    key: row.fullName,
    value: row.sonarProjectKey || 'No SonarCloud project key'
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
            head={[
              { id: 'repo', label: 'Repository' },
              { id: 'sonar', label: 'SonarCloud project key' }
            ]}
            rows={connected.map((row) => ({
              id: row.fullName,
              cells: [
                row.fullName,
                row.sonarProjectKey ? (
                  <code key="k" className="app-code">
                    {row.sonarProjectKey}
                  </code>
                ) : (
                  'None'
                )
              ]
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
  const [sonarKeys, setSonarKeys] = useState({})
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const submitting = useRef(false)
  const headingRef = useRef(null)
  const mounted = useRef(false)

  const suggestions = unassigned.filter(isRepositoryName)
  const project = settled(details)
  const rows = [
    ...selected.map((fullName) => ({
      fullName,
      sonarProjectKey: sonarKeys[fullName] ?? ''
    })),
    manual
  ]
  const mapped = repositories.map((r) => r.fullName)
  const detailsOk = !hasErrors(validateProject(project))
  const reposOk = !hasErrors(validateRepositories(rows, mapped))
  const current = resolveStep(step, { result, detailsOk, reposOk })

  useEffect(() => {
    const page =
      current === 'tasks'
        ? TITLES.tasks
        : `${TITLES[current]} – ${TITLES.tasks}`
    document.title = `${allowed ? page : 'Access Refused'} – ${SERVICE_NAME}`
  }, [allowed, current])

  // Move focus to the new step's heading, but not when the page first opens.
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus()
    mounted.current = true
  }, [current])

  if (!allowed) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
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

  const named = rows.filter((row) => row.fullName.trim())
  const detailsStarted =
    JSON.stringify(details) !== JSON.stringify(EMPTY_DETAILS)
  const reposStarted = selected.length > 0 || named.length > 0
  const taskItems = [
    {
      title: TITLES.details,
      hint: 'Name, slug, type, adoption date and Jira keys',
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
        toRepositoryMappings(project.slug, rows).map(connectRepository)
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
      setSubmitError(err.message)
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  const handleAnother = () => {
    setDetails(EMPTY_DETAILS)
    setSelected([])
    setSonarKeys({})
    setManual(EMPTY_MANUAL)
    setResult(null)
    setSubmitError(null)
    go('tasks')
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
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
                sonarKeys={sonarKeys}
                onSonarKey={(name, value) =>
                  setSonarKeys((keys) => ({ ...keys, [name]: value }))
                }
                manual={manual}
                onManual={setManual}
                rows={rows}
                mapped={mapped}
                onContinue={() => go('tasks')}
              />
            )}
            {current === 'check' && (
              <CheckStep
                details={project}
                repositories={named}
                submitError={submitError}
                saving={saving}
                changeLink={changeLink}
                onSubmit={handleSubmit}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
