import { useEffect, useId, useState } from 'react'

import { Panel } from '../dashboard'
import {
  Button,
  DateInput,
  ErrorSummary,
  InsetText,
  NotificationBanner,
  TextInput,
  WarningText
} from '../govuk'
import { jsonWrite } from '../../lib/api'
import { checkedWrite, toApiError } from '../../lib/api-errors'
import { formatDate, parseDate, toDateParts } from '../../lib/onboarding'
import {
  DEFAULT_SPRINT_CALENDAR,
  MAX_SPRINT_LENGTH_DAYS,
  sprintPeriodErrors
} from '../../lib/sprints'

const SAVE_FAILED = 'The sprint period could not be saved'

const formFor = (calendar) => ({
  length: String(calendar.cadenceDays),
  start: toDateParts(calendar.anchorDate)
})

const sameForm = (a, b) =>
  a.length.trim() === b.length.trim() &&
  ['day', 'month', 'year'].every(
    (part) => Number(a.start[part]) === Number(b.start[part])
  )

const daysText = (n) => `${n} ${Number(n) === 1 ? 'day' : 'days'}`

/** Settings → JIRA: the project's sprint length and the date one sprint started. */
export function SprintPeriodPanel({ project, onSaved, onDirtyChange }) {
  const baseId = useId()
  const lengthId = `${baseId}-length`
  const startId = `${baseId}-start`
  const calendar = { ...DEFAULT_SPRINT_CALENDAR, ...project?.sprintCalendar }
  const key = `${calendar.cadenceDays}|${calendar.anchorDate}`
  const [edit, setEdit] = useState(() => ({
    from: key,
    saved: formFor(calendar),
    form: formFor(calendar)
  }))
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  // A newly loaded sprint period replaces the edited copy.
  if (edit.from !== key) {
    setEdit({ from: key, saved: formFor(calendar), form: formFor(calendar) })
  }
  const { form, saved } = edit
  const dirty = !sameForm(form, saved)
  const setForm = (update) => {
    setNotice(null)
    setEdit((e) => ({ ...e, form: { ...e.form, ...update } }))
  }

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

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setNotice(null)
    setAttempt((a) => a + 1)
    const problems = sprintPeriodErrors(form)
    setErrors(problems)
    if (Object.keys(problems).length > 0) return
    const cadenceDays = Number(form.length)
    const anchorDate = parseDate(form.start).toISOString()
    setSaving(true)
    try {
      await checkedWrite(
        jsonWrite(
          `/api/projects/${encodeURIComponent(project.slug)}/sprint-calendar`,
          'PUT',
          { cadenceDays, anchorDate }
        ),
        { fallback: SAVE_FAILED, notFound: 'That project no longer exists' }
      )
      setEdit((e) => ({ ...e, saved: e.form }))
      setNotice({
        id: Date.now(),
        text: `Sprint period saved. Sprints are ${daysText(cadenceDays)} long, counted from ${formatDate(anchorDate)}.`
      })
      onSaved?.()
    } catch (err) {
      setErrors({ form: toApiError(err, SAVE_FAILED).message })
    } finally {
      setSaving(false)
    }
  }

  const errorList = [
    errors.length && { href: `#${lengthId}`, text: errors.length },
    errors.start && { href: `#${startId}-day`, text: errors.start },
    errors.form && { text: errors.form }
  ].filter(Boolean)

  return (
    <>
      {notice && (
        <NotificationBanner key={notice.id} type="success" autoFocus>
          {notice.text}
        </NotificationBanner>
      )}
      {errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
      )}
      <Panel
        title="Sprint Period"
        family="speed"
        icon="calendar"
        headingLevel={2}
        className="govuk-!-margin-bottom-4"
      >
        <p className="govuk-body">
          How long this project’s sprints are and the date one of them started.
          The dashboard counts every other sprint from these, for the live
          sprint, the period filter and the sprint trends.
        </p>
        <p className="govuk-body">
          Sprint period in use:{' '}
          <strong>
            {daysText(calendar.cadenceDays)}, counted from{' '}
            {formatDate(calendar.anchorDate)}
          </strong>
          .
        </p>
        {project?.jira?.boardId && (
          <InsetText>
            This project takes its sprints from its Jira board. The sprint
            period here is used only when the board cannot be reached.
          </InsetText>
        )}
        <form onSubmit={submit} noValidate>
          <TextInput
            id={lengthId}
            label="Sprint length in days"
            labelSize="s"
            hint={`A whole number from 1 to ${MAX_SPRINT_LENGTH_DAYS}. For example, 14 for two-week sprints.`}
            errorMessage={errors.length}
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            width="2"
            value={form.length}
            onChange={(event) => setForm({ length: event.target.value })}
          />
          <DateInput
            id={startId}
            legend="Date a sprint started"
            legendSize="s"
            hint="The first day of any sprint, past or current. For example, 8 7 2026."
            errorMessage={errors.start}
            value={form.start}
            onChange={(start) => setForm({ start })}
          />
          {dirty && (
            <WarningText>
              You have unsaved changes. Save the sprint period before you leave
              this page.
            </WarningText>
          )}
          <div className="govuk-button-group govuk-!-margin-bottom-0">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save sprint period'}
            </Button>
            {dirty && (
              <Button
                variant="secondary"
                onClick={() => {
                  setErrors({})
                  setEdit((e) => ({ ...e, form: e.saved }))
                }}
              >
                Cancel changes
              </Button>
            )}
          </div>
        </form>
      </Panel>
    </>
  )
}
