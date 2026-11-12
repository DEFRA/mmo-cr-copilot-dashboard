import { Panel, PanelState } from '../dashboard'
import { formatDuration } from '../../lib/selectors'
import { Meter, lines, plural } from './scope.jsx'

const PERSONA_STYLE = {
  developer: { family: 'leverage', icon: 'code' },
  devops: { family: 'speed', icon: 'merge' },
  qa: { family: 'assist', icon: 'check' }
}

export const personaPanelState = (status) => {
  if (status === 'loading' || status === 'idle') {
    return 'loading'
  }
  if (status === 'error') {
    return 'error'
  }
  return 'populated'
}

function StatRow({ label, children }) {
  return (
    <div className="app-stat-list__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function PersonaStats({ persona }) {
  return (
    <dl className="app-stat-list">
      <div className="app-stat-list__row">
        <dt>Copilot adoption</dt>
        <dd>{persona.adoptionPct}%</dd>
        <Meter value={persona.adoptionPct} />
      </div>
      <div className="app-stat-list__row">
        <dt>Commit assist rate</dt>
        <dd>{persona.copilotAssistedRate}%</dd>
        <Meter value={persona.copilotAssistedRate} />
      </div>
      <StatRow label="Line assist rate">
        {persona.copilotAssistedLineRate}%
      </StatRow>
      <StatRow label="Contributors (adopters)">
        {`${persona.contributorCount} (${persona.adopters})`}
      </StatRow>
      <StatRow label="Pull requests">{persona.prCount}</StatRow>
      <StatRow label="Copilot commits">
        {`${persona.copilotAssistedCommits} of ${persona.totalCommits}`}
      </StatRow>
      <StatRow label="Net lines delivered">{lines(persona.netLines)}</StatRow>
      <StatRow label="PR coding cycle time">
        {formatDuration(persona.avgCycleHours)}
      </StatRow>
    </dl>
  )
}

/** One delivery persona's headline numbers and the repositories it touched. */
export function PersonaPanel({ persona, state }) {
  const style = PERSONA_STYLE[persona.id]
  const idle = persona.totalCommits === 0
  const panelState = state === 'populated' && idle ? 'empty' : state

  return (
    <Panel
      title={persona.label}
      family={style.family}
      icon={style.icon}
      headingLevel={4}
      busy={state === 'loading'}
      aside={
        state === 'populated' && (
          <span className="app-mini-tag">
            {plural(persona.contributorCount, 'person', 'people')}
          </span>
        )
      }
    >
      <PanelState
        state={panelState}
        title={persona.label}
        icon="users"
        emptyMessage="No activity from this role in the selected period."
        errorMessage="We could not load the persona mappings. Try again later."
      >
        <PersonaStats persona={persona} />
        <details className="govuk-details govuk-!-margin-top-3 govuk-!-margin-bottom-0">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              {`Repositories (${persona.repoNames.length})`}
            </span>
          </summary>
          <div className="govuk-details__text">
            {persona.repoNames.join(' · ')}
          </div>
        </details>
      </PanelState>
    </Panel>
  )
}
