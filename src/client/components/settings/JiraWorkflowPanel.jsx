import { useEffect, useRef, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  Combobox,
  ErrorSummary,
  Hint,
  InsetText,
  NotificationBanner,
  Table,
  Tag,
  WarningText
} from '../govuk'
import { useJiraStatuses, useJiraWorkflow } from '../../hooks/useJiraWorkflow'
import { NO_JIRA_KEY } from '../../lib/api-errors'
import { hasJira } from '../../lib/jira'
import {
  STAGE_HINT,
  addStatusError,
  isWorkflowDirty,
  stageOf,
  statusOptions,
  tidyStatus,
  validateWorkflow,
  workflowSourceText
} from '../../lib/jira-workflow'

const CATEGORY_LABEL = {
  new: 'To Do',
  indeterminate: 'In Progress',
  done: 'Done'
}

const inputId = (stageId) => `stage-${stageId}-input`

function NoJiraKey() {
  return (
    <Panel title="Jira Workflow" family="speed" icon="ticket" headingLevel={2}>
      <PanelState
        state="empty"
        icon="ticket"
        emptyTag="Not available"
        emptyMessage={`${NO_JIRA_KEY}.`}
      />
    </Panel>
  )
}

function StatusesFound({ found, stages }) {
  const state = () => {
    if (found.statuses.length > 0) return 'populated'
    if (found.status === 'error') return 'error'
    if (found.status === 'success') return 'empty'
    return 'loading'
  }

  return (
    <Panel
      title="Statuses Found in This Project"
      family="speed"
      icon="ticket"
      headingLevel={2}
      busy={found.status === 'loading'}
    >
      <p className="govuk-body">
        The statuses your Jira project uses and those on tickets already synced,
        with the stage each one is in.
      </p>
      {found.status === 'success' && !found.jiraAvailable && (
        <InsetText>
          We could not reach Jira, so this list only shows statuses from tickets
          already synced.
        </InsetText>
      )}
      {found.status === 'error' && found.statuses.length > 0 && (
        <NotificationBanner headingLevel={3}>
          We could not refresh the statuses. Showing the last list loaded.
        </NotificationBanner>
      )}
      <PanelState
        state={state()}
        title="Jira statuses"
        icon="ticket"
        emptyTag="No statuses found"
        emptyMessage="Statuses appear here after a Jira sync."
        errorMessage="We could not load the Jira statuses. Try again later."
      >
        <Table
          caption="Jira Statuses and Their Stages"
          captionSize="s"
          head={[
            { id: 'status', label: 'Status' },
            { id: 'category', label: 'Jira category' },
            { id: 'stage', label: 'Stage' },
            { id: 'tickets', label: 'Tickets now', numeric: true }
          ]}
          rows={found.statuses.map((s) => {
            const stage = stageOf(stages, s.name)
            return {
              id: s.name,
              cells: [
                s.name,
                CATEGORY_LABEL[s.categoryKey] ?? 'Unknown',
                stage ? (
                  stage.label
                ) : (
                  <Tag key="stage" colour="grey">
                    Not mapped
                  </Tag>
                ),
                s.issueCount
              ]
            }
          })}
        />
      </PanelState>
      <Button
        variant="secondary"
        className="govuk-!-margin-bottom-0"
        disabled={found.status === 'loading'}
        onClick={() => found.refresh()}
      >
        {found.status === 'loading' ? 'Checking…' : 'Check Jira statuses again'}
      </Button>
    </Panel>
  )
}

/** Settings → Jira Workflow: which Jira statuses belong to each delivery stage. */
export function JiraWorkflowPanel({ project, onDirtyChange }) {
  const slug = hasJira(project) ? project.slug : null
  const { status, workflow, error, save, reload } = useJiraWorkflow(slug)
  const found = useJiraStatuses(slug)
  const [edit, setEdit] = useState({ from: null, stages: [] })
  const [queries, setQueries] = useState({})
  const [errors, setErrors] = useState({})
  const [showSummary, setShowSummary] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState(null)
  const [announce, setAnnounce] = useState('')
  const inputs = useRef(new Map())

  // A newly loaded or saved workflow replaces the edited copy.
  if (workflow && edit.from !== workflow) {
    setEdit({ from: workflow, stages: workflow.stages })
  }
  const stages = edit.from ? edit.stages : []
  const setStages = (update) =>
    setEdit((e) => ({ ...e, stages: update(e.stages) }))
  const dirty = Boolean(workflow) && isWorkflowDirty(stages, workflow.stages)
  const detected = found.statuses.map((s) => s.name)

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  if (!slug || (!workflow && error?.status === 422)) return <NoJiraKey />

  if (!workflow) {
    return (
      <Panel
        title="Jira Workflow"
        family="speed"
        icon="ticket"
        headingLevel={2}
        busy={status !== 'error'}
      >
        <PanelState
          state={status === 'error' ? 'error' : 'loading'}
          title="Jira Workflow"
          icon="ticket"
          errorMessage={error?.message}
          onRetry={reload}
        />
      </Panel>
    )
  }

  const clearError = (key) =>
    setErrors((e) => {
      const rest = { ...e }
      delete rest[key]
      return rest
    })

  const add = (stage, text) => {
    const error = addStatusError(stages, stage.id, text)
    if (error) {
      setErrors((e) => ({ ...e, [stage.id]: error }))
      return
    }
    const name = tidyStatus(text)
    setStages((list) =>
      list.map((s) =>
        s.id === stage.id ? { ...s, statuses: [...s.statuses, name] } : s
      )
    )
    setQueries((q) => ({ ...q, [stage.id]: '' }))
    clearError(stage.id)
    setNotice(null)
    setAnnounce(`${name} added to ${stage.label}`)
  }

  const remove = (stage, name) => {
    setStages((list) =>
      list.map((s) =>
        s.id === stage.id
          ? { ...s, statuses: s.statuses.filter((x) => x !== name) }
          : s
      )
    )
    setNotice(null)
    setAnnounce(`${name} removed from ${stage.label}`)
    inputs.current.get(stage.id)?.focus()
  }

  const resetTo = (next, message) => {
    setStages(() => next)
    setErrors({})
    setQueries({})
    setShowSummary(false)
    setNotice(null)
    setAnnounce(message)
  }

  const applySuggested = () =>
    resetTo(
      stages.map((s) => ({
        ...s,
        statuses: [...(workflow.suggestions[s.id] ?? [])]
      })),
      'Suggested statuses added to every stage. Save the workflow to use them.'
    )

  const reloadLatest = () => {
    setConflict(false)
    setErrors({})
    setShowSummary(false)
    reload()
  }

  const submit = async (event) => {
    event.preventDefault()
    setNotice(null)
    setAttempt((n) => n + 1)
    const problems = validateWorkflow(stages)
    if (Object.keys(problems).length > 0) {
      setErrors(problems)
      setShowSummary(true)
      return
    }
    setPending(true)
    const result = await save(stages, workflow.version)
    setPending(false)
    if (result.ok) {
      setErrors({})
      setShowSummary(false)
      setConflict(false)
      setNotice({
        id: Date.now(),
        text: 'Jira workflow saved. Delivery metrics now use these stages.'
      })
      return
    }
    setConflict(result.status === 409)
    setErrors({ form: result.message })
    setShowSummary(true)
  }

  const errorList = [
    ...stages
      .filter((s) => errors[s.id])
      .map((s) => ({ href: `#${inputId(s.id)}`, text: errors[s.id] })),
    errors.form && { text: errors.form }
  ].filter(Boolean)

  return (
    <>
      {notice && (
        <NotificationBanner key={notice.id} type="success" autoFocus>
          {notice.text}
        </NotificationBanner>
      )}
      {showSummary && errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
      )}

      <Panel
        title="Jira Workflow"
        family="speed"
        icon="ticket"
        headingLevel={2}
      >
        {status === 'error' && (
          <NotificationBanner headingLevel={3}>
            We could not refresh the Jira workflow. Showing the last version
            loaded.
          </NotificationBanner>
        )}
        <p className="govuk-body">
          Put each of your Jira statuses into a stage. A ticket starts when it
          first moves out of a To Do status and is delivered when it moves into
          a Done status. Every delivery metric uses these stages.
        </p>
        <InsetText>{workflowSourceText(workflow)}</InsetText>

        <form onSubmit={submit} noValidate>
          {stages.map((stage) => (
            <fieldset
              key={stage.id}
              className="govuk-fieldset govuk-!-margin-bottom-6"
              aria-describedby={`stage-${stage.id}-hint`}
            >
              <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">
                <h3 className="govuk-fieldset__heading">{stage.label}</h3>
              </legend>
              <Hint id={`stage-${stage.id}-hint`}>
                {STAGE_HINT[stage.kind]}
              </Hint>
              {stage.statuses.length === 0 ? (
                <p className="govuk-body-s">No statuses in this stage.</p>
              ) : (
                <ul
                  className="app-repo-list"
                  aria-label={`Statuses in ${stage.label}`}
                >
                  {stage.statuses.map((name) => (
                    <li className="app-repo-list__item" key={name}>
                      {name}
                      <button
                        type="button"
                        className="app-link-button app-repo-list__remove"
                        onClick={() => remove(stage, name)}
                      >
                        Remove{' '}
                        <span className="govuk-visually-hidden">
                          {name} from {stage.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Combobox
                id={inputId(stage.id)}
                label={`Add a status to ${stage.label}`}
                errorMessage={errors[stage.id]}
                value={queries[stage.id] ?? ''}
                onChange={(text) => {
                  setQueries((q) => ({ ...q, [stage.id]: text }))
                }}
                options={statusOptions(
                  stages,
                  stage.id,
                  workflow.suggestions,
                  detected
                )}
                onSelect={(text) => add(stage, text)}
                allowCustom
                addText={(text) => `Add ‘${text}’`}
                itemName="status"
                itemNamePlural="statuses"
                formGroupClassName="govuk-!-margin-bottom-0"
                inputRef={(el) => {
                  if (el) inputs.current.set(stage.id, el)
                  else inputs.current.delete(stage.id)
                }}
              />
            </fieldset>
          ))}

          {dirty && (
            <WarningText>
              You have unsaved changes. Save the workflow before you leave this
              page.
            </WarningText>
          )}
          <div className="govuk-button-group">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save workflow'}
            </Button>
            {conflict && (
              <Button variant="secondary" onClick={reloadLatest}>
                Reload the workflow
              </Button>
            )}
            {dirty && (
              <Button
                variant="secondary"
                onClick={() => resetTo(workflow.stages, 'Changes cancelled')}
              >
                Cancel changes
              </Button>
            )}
            <Button variant="secondary" onClick={applySuggested}>
              Use suggested statuses
            </Button>
          </div>
          <div className="govuk-visually-hidden" aria-live="polite">
            {announce}
          </div>
        </form>
      </Panel>

      <StatusesFound found={found} stages={stages} />
    </>
  )
}
