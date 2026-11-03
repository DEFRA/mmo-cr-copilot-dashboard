/**
 * SonarCloud code-quality UI.
 *
 * All colour is token-driven and every status is carried by TEXT + a letter or
 * icon as well as colour (never colour alone). The panels self-hide when the
 * integration is disabled (`configured:false`) or a repository has no Sonar
 * project (`linked:false`), so views can render them unconditionally.
 */
import { useEffect, useId, useMemo, useState } from 'react'

import {
  ChartFigure,
  Panel as SectionPanel,
  PanelState,
  SonarRating
} from '../dashboard'
import { Tag } from '../govuk'
import { cx } from '../govuk/utils.js'
import { Meter } from '../views/scope.jsx'
import { useSonarMetrics } from '../../hooks/useSonarMetrics'
import { apiFetch, apiUrl } from '../../lib/api'
import { shortRepoName } from '../../lib/selectors'
import { formatSprintRange } from '../../lib/sprints'
import { TrendLine } from './TrendLine'

const GATE_TAGS = {
  passed: { colour: 'green', label: 'Passed' },
  warning: { colour: 'yellow', label: 'Warning' },
  failed: { colour: 'red', label: 'Failed' },
  none: { colour: 'grey', label: 'No analysis' }
}

const QUALITY_ROWS = [
  { key: 'coverage', label: 'Coverage', pct: true, meter: true },
  { key: 'duplicated_lines_density', label: 'Duplications', pct: true },
  { key: 'bugs', label: 'Bugs' },
  { key: 'vulnerabilities', label: 'Vulnerabilities' },
  { key: 'code_smells', label: 'Code smells' },
  { key: 'security_hotspots', label: 'Security hotspots' }
]

const NEW_CODE_ROWS = QUALITY_ROWS.map((row) => ({
  ...row,
  key: `new_${row.key}`
}))

const CARD_MEASURES = [
  { key: 'coverage', label: 'Coverage', pct: true },
  { key: 'bugs', label: 'Bugs' },
  { key: 'vulnerabilities', label: 'Vulnerabilities' }
]

const panelStateFor = (status, data) => {
  if (status === 'loading' || status === 'idle') return 'loading'
  if (status === 'error') return 'error'
  if (!data || data.configured === false || data.linked === false) {
    return 'empty'
  }
  if (data.analyzed === false) return 'empty'
  return 'populated'
}

/**
 * Quality gate for a repository's main branch, or for a pull request's new
 * code when given `prNumber` (docs/design-system.md §8.6). An unconfigured,
 * unlinked or unanalysed target shows the empty state (§9 Partial).
 */
export function SonarQualityGatePanel({ repository, prNumber, asOf }) {
  const isPr = typeof prNumber === 'number'
  const query = `repository=${encodeURIComponent(repository)}`
  const asOfQuery = asOf ? `&asOf=${encodeURIComponent(asOf)}` : ''
  const { data, status } = useSonarMetrics(
    isPr
      ? `/api/sonar/pr?${query}&prNumber=${prNumber}`
      : `/api/sonar/repo?${query}${asOfQuery}`
  )
  const noAnalysisBefore =
    !isPr && Boolean(data?.asOf) && data?.analysisDate === null
  const state = noAnalysisBefore ? 'empty' : panelStateFor(status, data)
  const gate = GATE_TAGS[data?.qualityGate] ?? GATE_TAGS.none
  const measures = data?.measures ?? {}
  const ratings = data?.ratings ?? {}
  const title = isPr ? 'Code Quality on New Code' : 'Quality Gate'
  const notAnalysed = isPr && data?.analyzed === false
  const caption = isPr ? null : asAtCaption(data?.asOf)
  const lastAnalysis = isPr ? null : lastAnalysisText(data?.analysisDate)

  let emptyMessage = 'This repository is not linked to SonarCloud.'
  if (notAnalysed) {
    emptyMessage = 'This pull request has not been analysed by SonarCloud.'
  } else if (noAnalysisBefore) {
    emptyMessage = `No SonarCloud analysis before ${longDate(data.asOf)}.`
  }

  return (
    <SectionPanel
      title={title}
      family="quality"
      icon={isPr ? 'shield' : 'check'}
      busy={state === 'loading'}
      aside={
        state === 'populated' && (
          <>
            {caption && <span className="app-mini-tag">{caption}</span>}
            <Tag colour={gate.colour}>{gate.label}</Tag>
          </>
        )
      }
    >
      <PanelState
        state={state}
        title={title}
        icon="shield"
        emptyTag="Not available yet"
        emptyMessage={emptyMessage}
        errorMessage="We could not load SonarCloud data. Try again later."
      >
        <div className="app-quality">
          <div className="app-quality__body">
            <div className="app-ratings">
              <SonarRating rating={ratings.reliability} label="Reliability" />
              <SonarRating rating={ratings.security} label="Security" />
              <SonarRating
                rating={ratings.maintainability}
                label="Maintainability"
              />
            </div>
            <dl className="app-stat-list app-quality__stats">
              {(isPr ? NEW_CODE_ROWS : QUALITY_ROWS).map((row) => (
                <div key={row.key} className="app-stat-list__row">
                  <dt>{row.label}</dt>
                  <dd>{fmt(measures[row.key], { pct: row.pct })}</dd>
                  {row.meter && measures[row.key] != null && (
                    <Meter value={measures[row.key]} />
                  )}
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="govuk-body-s app-quality__foot">
          {lastAnalysis && <span className="app-muted">{lastAnalysis}</span>}
          <a
            className="govuk-link"
            href={data?.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on SonarCloud (opens in new tab)
          </a>
        </p>
      </PanelState>
    </SectionPanel>
  )
}

function fmt(value, { pct = false } = {}) {
  if (value == null || Number.isNaN(value)) return '–'
  const n = pct ? Math.round(value * 10) / 10 : value
  return pct ? `${n}%` : `${n}`
}

/**
 * Portfolio view: one card per linked repository with its main-branch quality
 * gate and headline measures, each opening that repository. Hides itself when
 * SonarCloud is not configured or nothing is linked.
 */
export function SonarPortfolioPanel({ onOpenRepo, asOf }) {
  const { data, status } = useSonarMetrics(
    `/api/sonar/overview${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`
  )
  const title = 'Code Quality Across Repositories'

  if (status === 'success' && (!Array.isArray(data) || data.length === 0)) {
    return null
  }

  let state = 'populated'
  if (status === 'loading' || status === 'idle') state = 'loading'
  else if (status === 'error') state = 'error'

  const repos = Array.isArray(data) ? data : []
  const caption = asAtCaption(asOf)
  const lastAnalysis = lastAnalysisText(latestAnalysis(repos), 'Latest')

  return (
    <SectionPanel
      title={title}
      family="quality"
      icon="shield"
      busy={state === 'loading'}
      aside={caption && <span className="app-mini-tag">{caption}</span>}
    >
      <PanelState
        state={state}
        title={title}
        icon="shield"
        errorMessage="We could not load SonarCloud data. Try again later."
      >
        <ul className="app-gate-grid" aria-label="Repositories">
          {repos.map((repo) => (
            <li key={repo.repository}>
              <SonarRepoCard
                repo={repo}
                onOpen={onOpenRepo && (() => onOpenRepo(repo.repository))}
              />
            </li>
          ))}
        </ul>
        {lastAnalysis && (
          <p className="govuk-body-s app-quality__foot app-muted">
            {lastAnalysis}
          </p>
        )}
      </PanelState>
    </SectionPanel>
  )
}

/** KPI-style card: band and tag show the gate, the body its headline measures. */
function SonarRepoCard({ repo, onOpen }) {
  const labelId = useId()
  const gateKey = GATE_TAGS[repo.qualityGate] ? repo.qualityGate : 'none'
  const gate = GATE_TAGS[gateKey]
  const measures = repo.measures ?? {}
  const name = shortRepoName(repo.repository)

  return (
    <article
      className={cx(
        'app-kpi app-gate',
        `app-gate--${gateKey}`,
        onOpen && 'app-kpi--action'
      )}
      aria-labelledby={labelId}
    >
      <div className="app-kpi__head">
        <h4 className="app-kpi__label" id={labelId}>
          {onOpen ? (
            <button type="button" className="app-kpi__action" onClick={onOpen}>
              {name}
              <span className="govuk-visually-hidden">
                , quality gate {gate.label.toLowerCase()}, open repository
              </span>
            </button>
          ) : (
            name
          )}
        </h4>
        {onOpen && (
          <span className="app-kpi__chevron" aria-hidden="true">
            ›
          </span>
        )}
      </div>
      <p className="app-gate__status">
        <Tag colour={gate.colour}>{gate.label}</Tag>
      </p>
      <dl className="app-gate__stats">
        {CARD_MEASURES.map((m) => (
          <div key={m.key}>
            <dt>{m.label}</dt>
            <dd>{fmt(measures[m.key], { pct: m.pct })}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

/**
 * Repositories passing the quality gate at the end of each recent sprint.
 * Hidden when SonarCloud is not configured. `sprints` is newest first.
 */
export function SonarSprintTrend({ sprints, number }) {
  const ends = useMemo(
    () =>
      [...sprints].reverse().map((s) => ({
        label: formatSprintRange(s.start, s.end),
        asOf: new Date(new Date(s.end).getTime() - 1000).toISOString()
      })),
    [sprints]
  )
  const { points, status } = useSonarTrend(ends)

  if (status === 'unconfigured') return null

  const title = 'Repositories passing the quality gate by sprint'
  const rows = points.map((p) => [p.label, p.passed, p.linked])
  let state = 'populated'
  if (status === 'loading') state = 'loading'
  else if (status === 'error') state = 'error'

  return (
    <ChartFigure
      number={number}
      title={title}
      subtitle="Share of linked repositories whose main branch passed the SonarCloud quality gate at each sprint's last analysis"
      family="quality"
      icon="shield"
      state={state}
      columns={[
        { id: 'sprint', label: 'Sprint' },
        { id: 'passed', label: 'Passing', numeric: true },
        { id: 'linked', label: 'Linked repositories', numeric: true }
      ]}
      rows={rows}
    >
      <TrendLine
        title={title}
        unit="%"
        categories={points.map((p) => p.label)}
        series={[
          {
            name: 'Passing',
            colorToken: 'success',
            data: points.map((p) =>
              p.linked ? Math.round((p.passed / p.linked) * 100) : null
            )
          }
        ]}
      />
    </ChartFigure>
  )
}

function useSonarTrend(ends) {
  const [state, setState] = useState({ points: [], status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ points: [], status: 'loading' })
    Promise.all(
      ends.map(({ asOf }) =>
        apiFetch(
          apiUrl(`/api/sonar/overview?asOf=${encodeURIComponent(asOf)}`),
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
          }
        ).then((res) => {
          if (!res.ok) throw new Error(`Request failed (${res.status})`)
          return res.json()
        })
      )
    )
      .then((results) => {
        if (results.some((r) => !Array.isArray(r) || r.length === 0)) {
          setState({ points: [], status: 'unconfigured' })
          return
        }
        setState({
          status: 'success',
          points: results.map((repos, i) => ({
            label: ends[i].label,
            passed: repos.filter((r) => r.qualityGate === 'passed').length,
            linked: repos.length
          }))
        })
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setState({ points: [], status: 'error' })
      })
    return () => controller.abort()
  }, [ends])

  return state
}

function latestAnalysis(repos) {
  return repos
    .map((r) => r.analysisDate)
    .filter(Boolean)
    .sort()
    .at(-1)
}

const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

/** Compact panel tag for a past cut-off, for example "As at 14 Oct 2026". */
export function asAtCaption(asOf) {
  if (!asOf) return null
  return `As at ${new Date(asOf).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })}`
}

/** "Last analysis 13 October 2026", shown in the panel foot. */
export function lastAnalysisText(analysisDate, prefix = 'Last') {
  return analysisDate ? `${prefix} analysis ${longDate(analysisDate)}` : null
}
