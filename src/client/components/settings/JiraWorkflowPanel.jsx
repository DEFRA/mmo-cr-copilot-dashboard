import { useRef, useState } from 'react'

import { Panel, PanelState } from '../dashboard'
import {
  Button,
  Combobox,
  ErrorSummary,
  Hint,
  InsetText,
  NotificationBanner,
  WarningText
} from '../govuk'
import { useJiraStatuses, useJiraWorkflow } from '../../hooks/useJiraWorkflow'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard.js'
import { NO_JIRA_KEY } from '../../lib/api-errors'
import { HTTP } from '../../lib/http-status.js'
import { hasJira } from '../../lib/jira'
import {
  DEFINITION_OF_DONE,
  STAGE_HINT,
  addStatusError,
  definitionOfDone,
  isWorkflowDirty,
  stageTitle,
  statusOptions,
  tidyStatus,
  validateWorkflow,
  workflowSourceText
} from '../../lib/jira-workflow'
import { StatusesFound } from './JiraStatusesFound.jsx'

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

const workflowErrors = (stages, errors) =>
  [
    ...stages
      .filter((s) => errors[s.id])
      .map((s) => ({ href: `#${inputId(s.id)}`, text: errors[s.id] })),
    errors.form && { text: errors.form }
  ].filter(Boolean)

function WorkflowMessages({ notice, errorList, showSummary, attempt }) {
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
    </>
  )
}

function WorkflowLoading({ status, error, reload }) {
  const failed = status === 'error'
  return (
    <Panel
      title="Jira Workflow"
      family="speed"
      icon="ticket"
      headingLevel={2}
      busy={!failed}
    >
      <PanelState
        state={failed ? 'error' : 'loading'}
        title="Jira Workflow"
        icon="ticket"
        errorMessage={error?.message}
        onRetry={reload}
      />
    </Panel>
  )
}

function WorkflowIntro({ status, workflow, doneStage, onChangeDone }) {
  return (
    <Panel
      title="Jira Workflow"
      family="speed"
      icon="ticket"
      headingLevel={2}
      className="app-span-12"
    >
      {status === 'error' && (
        <NotificationBanner headingLevel={3}>
          We could not refresh the Jira workflow. Showing the last version
          loaded.
        </NotificationBanner>
      )}
      <p className="govuk-body">
        Put each of your Jira statuses into a stage. A ticket starts when it
        first moves out of a To Do status and is delivered when it moves into a
        status in your Definition of Done. Every delivery metric uses these
        stages.
      </p>
      {doneStage && (
        <p className="govuk-body">
          {`${DEFINITION_OF_DONE} in use: `}
          <strong>
            {definitionOfDone(workflow.stages).join(', ') || 'no statuses yet'}
          </strong>
          .{' '}
          <button
            type="button"
            className="app-link-button"
            onClick={onChangeDone}
          >
            {`Change the ${DEFINITION_OF_DONE}`}
          </button>
        </p>
      )}
      <InsetText className="govuk-!-margin-bottom-0">
        {workflowSourceText(workflow)}
      </InsetText>
    </Panel>
  )
}

function StageStatuses({ stage, onRemove }) {
  if (stage.statuses.length === 0) {
    return <p className="govuk-body-s">No statuses in this stage.</p>
  }
  const title = stageTitle(stage)
  return (
    <ul className="app-repo-list" aria-label={`Statuses in ${title}`}>
      {stage.statuses.map((name) => (
        <li className="app-repo-list__item" key={name}>
          {name}
          <button
            type="button"
            className="app-link-button app-repo-list__remove"
            onClick={() => onRemove(stage, name)}
          >
            Remove{' '}
            <span className="govuk-visually-hidden">
              {`${name} from ${title}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function StagePanel({
  stage,
  error,
  query,
  options,
  onQuery,
  onAdd,
  onRemove,
  inputRef
}) {
  const title = stageTitle(stage)
  const count = stage.statuses.length
  const hintId = `stage-${stage.id}-hint`
  return (
    <Panel
      title={title}
      family="speed"
      icon="flow"
      className="app-span-6"
      aside={
        <span className="app-mini-tag">
          {`${count} ${count === 1 ? 'status' : 'statuses'}`}
        </span>
      }
    >
      <fieldset className="govuk-fieldset" aria-describedby={hintId}>
        <legend className="govuk-visually-hidden">{title}</legend>
        <Hint id={hintId}>{STAGE_HINT[stage.kind]}</Hint>
        <StageStatuses stage={stage} onRemove={onRemove} />
        <Combobox
          id={inputId(stage.id)}
          label={`Add a status to ${title}`}
          errorMessage={error}
          value={query}
          onChange={onQuery}
          options={options}
          onSelect={(text) => onAdd(stage, text)}
          allowCustom
          addText={(text) => `Add ‘${text}’`}
          itemName="status"
          itemNamePlural="statuses"
          formGroupClassName="govuk-!-margin-bottom-0"
          inputRef={inputRef}
        />
      </fieldset>
    </Panel>
  )
}

function SaveActions({
  dirty,
  pending,
  conflict,
  announce,
  onReload,
  onCancel,
  onSuggest
}) {
  return (
    <Panel
      title="Save Your Changes"
      family="speed"
      icon="check"
      className="app-span-12"
    >
      {dirty && (
        <WarningText>
          You have unsaved changes. Save the workflow before you leave this
          page.
        </WarningText>
      )}
      <div className="govuk-button-group govuk-!-margin-bottom-0">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save workflow'}
        </Button>
        {conflict && (
          <Button variant="secondary" onClick={onReload}>
            Reload the workflow
          </Button>
        )}
        {dirty && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel changes
          </Button>
        )}
        <Button variant="secondary" onClick={onSuggest}>
          Use suggested statuses
        </Button>
      </div>
      <div className="govuk-visually-hidden" aria-live="polite">
        {announce}
      </div>
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
  const doneStage = stages.find((s) => s.kind === 'done')

  useUnsavedGuard(dirty, onDirtyChange)

  if (!slug || (!workflow && error?.status === HTTP.unprocessable)) {
    return <NoJiraKey />
  }

  if (!workflow) {
    return <WorkflowLoading status={status} error={error} reload={reload} />
  }

  const clearError = (key) =>
    setErrors((e) => {
      const rest = { ...e }
      delete rest[key]
      return rest
    })

  const focusDone = () => inputs.current.get(doneStage.id)?.focus()

  const add = (stage, text) => {
    const problem = addStatusError(stages, stage.id, text)
    if (problem) {
      setErrors((e) => ({ ...e, [stage.id]: problem }))
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
    setAnnounce(`${name} added to ${stageTitle(stage)}`)
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
    setAnnounce(`${name} removed from ${stageTitle(stage)}`)
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
    setConflict(result.status === HTTP.conflict)
    setErrors({ form: result.message })
    setShowSummary(true)
  }

  return (
    <>
      <WorkflowMessages
        notice={notice}
        errorList={workflowErrors(stages, errors)}
        showSummary={showSummary}
        attempt={attempt}
      />

      <div className="app-grid">
        <WorkflowIntro
          status={status}
          workflow={workflow}
          doneStage={doneStage}
          onChangeDone={focusDone}
        />

        <form className="app-span-12" onSubmit={submit} noValidate>
          <div className="app-grid">
            {stages.map((stage) => (
              <StagePanel
                key={stage.id}
                stage={stage}
                error={errors[stage.id]}
                query={queries[stage.id] ?? ''}
                options={statusOptions(
                  stages,
                  stage.id,
                  workflow.suggestions,
                  detected
                )}
                onQuery={(text) => {
                  setQueries((q) => ({ ...q, [stage.id]: text }))
                }}
                onAdd={add}
                onRemove={remove}
                inputRef={(el) => {
                  if (el) {
                    inputs.current.set(stage.id, el)
                  } else {
                    inputs.current.delete(stage.id)
                  }
                }}
              />
            ))}

            <SaveActions
              dirty={dirty}
              pending={pending}
              conflict={conflict}
              announce={announce}
              onReload={reloadLatest}
              onCancel={() => resetTo(workflow.stages, 'Changes cancelled')}
              onSuggest={applySuggested}
            />
          </div>
        </form>

        <div className="app-span-12">
          <StatusesFound found={found} stages={stages} />
        </div>
      </div>
    </>
  )
}
