import { useRef, useState } from 'react'

import {
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
import {
  EMPTY_DETAILS,
  addRepository,
  formatDate,
  jiraKeyField,
  parseDate,
  typeLabel,
  validateProject,
  validateRepositories
} from '../../lib/onboarding'
import { toHash } from '../../lib/routes'

const AI_ADOPTED = 'ai-adopted'

export const TITLES = {
  tasks: 'Onboard a Project',
  details: 'Project Details',
  repositories: 'Connect Repositories',
  check: 'Review and Onboard Project',
  confirmation: 'Project Onboarded'
}

const TYPE_ITEMS = [
  {
    value: AI_ADOPTED,
    text: 'AI-Adopted',
    hint: 'An existing team adopting GitHub Copilot.'
  },
  {
    value: 'ai-native',
    text: 'AI-Native',
    hint: 'A team building with an agentic delivery lifecycle from the start.'
  }
]

export const DETAIL_FIELDS = {
  name: 'project-name',
  slug: 'project-slug',
  type: 'project-type',
  adoption: 'project-adoption-day',
  jiraKey: 'project-jira-key'
}

export const hasErrors = (errors) => Object.keys(errors).length > 0

// An AI-Native project has no adoption date, whatever was typed before
// switching. The slug and Jira key are upper-cased defensively.
export const settled = (details) => ({
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

// A details answer the backend refused stays an error until it is changed.
export function withRejected(errors, project, rejected) {
  const found = { ...errors }
  for (const [key, { value, text }] of Object.entries(rejected)) {
    if (!found[key] && project[key] === value) {
      found[key] = text
    }
  }
  return found
}

export function DetailsStep({ details, rejected, onChange, onContinue }) {
  const [errors, setErrors] = useState(() =>
    withRejected({}, settled(details), rejected)
  )
  const [attempt, setAttempt] = useState(0)
  const set = (key) => (value) => onChange({ ...details, [key]: value })
  const jiraField = jiraKeyField(details.type)

  // The Jira key rule follows the type, so an error shown for it is re-checked.
  const handleType = (type) => {
    set('type')(type)
    if (!errors.jiraKey) {
      return
    }
    const { jiraKey } = withRejected(
      validateProject(settled({ ...details, type })),
      settled({ ...details, type }),
      rejected
    )
    setErrors((shown) => {
      const next = { ...shown }
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
    if (!hasErrors(found)) {
      onContinue()
    }
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
      {details.type === AI_ADOPTED && (
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

function SelectedRepositories({ selected, onRemove }) {
  if (selected.length === 0) {
    return <p className="govuk-body">No repositories added yet.</p>
  }
  return (
    <ul className="app-repo-list">
      {selected.map((name) => (
        <li className="app-repo-list__item" key={name}>
          {name}
          <button
            type="button"
            className="app-link-button app-repo-list__remove"
            onClick={() => onRemove(name)}
          >
            Remove <span className="govuk-visually-hidden">{name}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function SourceStatus({ status }) {
  if (status === 'loading') {
    return (
      <output className="govuk-body app-block">
        Loading repositories that are sending data…
      </output>
    )
  }
  if (status === 'error') {
    return (
      <InsetText>
        We could not load the repositories that are sending data. You can still
        add one below.
      </InsetText>
    )
  }
  return null
}

const repositoryHint = (hasSuggestions) =>
  [
    hasSuggestions
      ? 'Choose a repository that is already sending data, or type a new one as owner/name, like DEFRA/mmo-cr-pdf, and press Enter.'
      : 'Type the repository as owner/name, like DEFRA/mmo-cr-pdf, and press Enter.',
    'Map a repository before adding the analytics workflow to it.'
  ].join(' ')

export function RepositoriesStep({
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
    if (!hasErrors(found)) {
      onContinue()
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error?.summary && (
        <ErrorSummary
          key={attempt}
          errors={[{ href: '#repository-input', text: error.text }]}
        />
      )}
      <SourceStatus status={status} />
      <Combobox
        id="repository-input"
        label="Add a repository"
        labelSize="s"
        hint={repositoryHint(suggestions.length > 0)}
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
      <SelectedRepositories selected={selected} onRemove={remove} />
      <div className="govuk-visually-hidden" aria-live="polite">
        {notice}
      </div>
      <Button type="submit">Save and continue</Button>
    </form>
  )
}

function adoptionRows(details) {
  if (details.type !== AI_ADOPTED) {
    return []
  }
  const date = parseDate(details.adoption)
  return [
    {
      key: 'Adoption start date',
      value: date ? formatDate(date.toISOString()) : 'Not set'
    }
  ]
}

export function CheckStep({
  details,
  repositories,
  submitError,
  saving,
  changeLink,
  onSubmit
}) {
  const detailRows = [
    { key: 'Project name', value: details.name.trim() },
    { key: 'Project slug', value: details.slug },
    { key: 'Project type', value: typeLabel(details.type) },
    ...adoptionRows(details),
    { key: 'Jira project key', value: details.jiraKey || 'None' }
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
        <output className="govuk-body app-block">
          Onboarding the project…
        </output>
      )}
    </>
  )
}

export function TaskListStep({ items, completed, headingRef }) {
  return (
    <>
      <h1 className="govuk-heading-xl" ref={headingRef} tabIndex={-1}>
        {TITLES.tasks}
      </h1>
      <p className="govuk-body">
        Complete each task, then review and onboard the project.
      </p>
      <p className="govuk-body">
        {`You have completed ${completed} of ${items.length} tasks.`}
      </p>
      <TaskList items={items} idPrefix="onboarding-task" />
    </>
  )
}

function FailedRepositories({ failed }) {
  const count = failed.length
  if (count === 0) {
    return null
  }
  return (
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
        The project was created. Connect these repositories in Settings, under
        Repositories, before adding the analytics workflow to them.
      </p>
    </>
  )
}

function ConnectedRepositories({ connected }) {
  if (connected.length === 0) {
    return null
  }
  return (
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
  )
}

export function ConfirmationStep({ result, headingRef, onLaunch, onAnother }) {
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

      <FailedRepositories failed={result.failed} />
      <ConnectedRepositories connected={result.connected} />

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
