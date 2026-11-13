import { useEffect, useRef, useState } from 'react'

import { BackLink } from '../govuk'
import { isPlainClick } from '../govuk/utils.js'
import { useRepositories } from '../../hooks/useRepositories'
import { jsonWrite } from '../../lib/api'
import { ensureOk, readApiError, toApiError } from '../../lib/api-errors'
import {
  EMPTY_DETAILS,
  isRepositoryName,
  toProjectRequest,
  toRepositoryMappings,
  validateProject,
  validateRepositories
} from '../../lib/onboarding'
import { toHash } from '../../lib/routes'
import {
  CheckStep,
  ConfirmationStep,
  DETAIL_FIELDS,
  DetailsStep,
  RepositoriesStep,
  TITLES,
  TaskListStep,
  hasErrors,
  settled,
  withRejected
} from './onboarding-steps.jsx'

const SERVICE_NAME = 'Copilot Delivery Insights'

// The task list is the route with no step.
const stepHash = (step) =>
  toHash({ level: 'onboarding', step: step === 'tasks' ? undefined : step })

const COMPLETED = { text: 'Completed', tag: true, colour: 'green' }
const IN_PROGRESS = { text: 'In progress', tag: true, colour: 'light-blue' }
const NOT_STARTED = { text: 'Not started', tag: true, colour: 'blue' }
const READY = { text: 'Ready', tag: true, colour: 'blue' }
const CANNOT_START = { text: 'Cannot start yet' }

function progress(complete, started) {
  if (complete) {
    return COMPLETED
  }
  return started ? IN_PROGRESS : NOT_STARTED
}

// A task opens only once the earlier ones are done; a link to it is refused too.
function resolveStep(requested, { result, detailsOk, reposOk }) {
  if (result) {
    return 'confirmation'
  }
  if (requested === 'details') {
    return 'details'
  }
  if (requested === 'repositories') {
    return detailsOk ? 'repositories' : 'tasks'
  }
  if (requested === 'check') {
    return detailsOk && reposOk ? 'check' : 'tasks'
  }
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
    if (res.ok) {
      return { fullName }
    }
    const { message } = await readApiError(res, { fallback })
    return {
      fullName,
      error: message.includes(fullName) ? message : `${fullName}: ${message}`
    }
  } catch {
    return { fullName, error: fallback }
  }
}

function pageTitle(allowed, step) {
  if (!allowed) {
    return `Access Refused – ${SERVICE_NAME}`
  }
  const page =
    step === 'tasks' ? TITLES.tasks : `${TITLES[step]} – ${TITLES.tasks}`
  return `${page} – ${SERVICE_NAME}`
}

function taskListItems({ detailsOk, reposOk, details, selected, stepLink }) {
  const detailsStarted =
    JSON.stringify(details) !== JSON.stringify(EMPTY_DETAILS)
  const ready = detailsOk && reposOk
  return [
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
      status: detailsOk ? progress(reposOk, selected.length > 0) : CANNOT_START
    },
    {
      title: TITLES.check,
      hint: 'Check your answers and create the project',
      ...(ready ? stepLink('check') : {}),
      status: ready ? READY : CANNOT_START
    }
  ]
}

function HomeLink({ onNavigateHome }) {
  return (
    <BackLink
      href={toHash({ level: 'overview' })}
      onClick={onNavigateHome}
      className="govuk-!-margin-bottom-6"
    >
      Back to overview
    </BackLink>
  )
}

function NotAllowed({ onNavigateHome }) {
  return (
    <div className="app-onboarding">
      <HomeLink onNavigateHome={onNavigateHome} />
      <h1 className="govuk-heading-xl">You Cannot Onboard Projects</h1>
      <p className="govuk-body">
        You need the Dashboard Admin role to onboard a project.
      </p>
      <p className="govuk-body">
        If you think you should be able to, ask a dashboard admin or the service
        team.
      </p>
    </div>
  )
}

function StepHeading({ step, items, completed, headingRef }) {
  if (step === 'tasks') {
    return (
      <TaskListStep
        items={items}
        completed={completed}
        headingRef={headingRef}
      />
    )
  }
  return (
    <>
      <span className="govuk-caption-l">{TITLES.tasks}</span>
      <h1 className="govuk-heading-xl" ref={headingRef} tabIndex={-1}>
        {TITLES[step]}
      </h1>
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
    document.title = pageTitle(allowed, current)
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
    return <NotAllowed onNavigateHome={onNavigateHome} />
  }

  const go = (target) => {
    onStepChange?.(target === 'tasks' ? undefined : target)
  }

  const stepLink = (target) => ({
    href: stepHash(target),
    onClick: (event) => {
      if (!isPlainClick(event)) {
        return
      }
      event.preventDefault()
      go(target)
    }
  })

  const changeLink = (target) => ({ text: 'Change', ...stepLink(target) })

  const taskItems = taskListItems({
    detailsOk,
    reposOk,
    details,
    selected,
    stepLink
  })
  const completed = taskItems.filter((item) => item.status === COMPLETED).length

  const back = current === 'tasks' ? null : stepLink('tasks')

  const handleSubmit = async () => {
    if (submitting.current || result) {
      return
    }
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
        setRejected((prev) => ({
          ...prev,
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
            <HomeLink onNavigateHome={onNavigateHome} />
          )}
          <StepHeading
            step={current}
            items={taskItems}
            completed={completed}
            headingRef={headingRef}
          />
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
