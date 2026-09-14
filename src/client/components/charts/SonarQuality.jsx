/**
 * SonarCloud code-quality UI.
 *
 * All colour is token-driven and every status is carried by TEXT + a letter or
 * icon as well as colour (never colour alone). The panels self-hide when the
 * integration is disabled (`configured:false`) or a repository has no Sonar
 * project (`linked:false`), so views can render them unconditionally.
 */
import { Panel } from '../Panel'
import { useSonarMetrics } from '../../hooks/useSonarMetrics'
import { shortRepoName } from '../../lib/selectors'

const GATE_META = {
  passed: { color: 'var(--color-success)', label: 'Passed', icon: '✓' },
  warning: { color: 'var(--color-warning)', label: 'Warning', icon: '!' },
  failed: { color: 'var(--color-danger)', label: 'Failed', icon: '✕' },
  none: { color: 'var(--color-text-muted)', label: 'No analysis', icon: '–' }
}

function gateMeta(status) {
  return GATE_META[status] ?? GATE_META.none
}

function ratingColor(letter) {
  switch (letter) {
    case 'A':
    case 'B':
      return 'var(--color-success)'
    case 'C':
      return 'var(--color-warning)'
    case 'D':
    case 'E':
      return 'var(--color-danger)'
    default:
      return 'var(--color-text-muted)'
  }
}

function fmt(value, { pct = false } = {}) {
  if (value == null || Number.isNaN(value)) return '–'
  const n = pct ? Math.round(value * 10) / 10 : value
  return pct ? `${n}%` : `${n}`
}

export function SonarGate({ status }) {
  const meta = gateMeta(status)
  return (
    <span className="sonar-gate" style={{ '--sonar-color': meta.color }}>
      <span aria-hidden="true">{meta.icon}</span>
      <span>Quality gate: {meta.label}</span>
    </span>
  )
}

function RatingBadge({ label, letter }) {
  return (
    <span className="sonar-rating">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </span>
      <span
        className="sonar-badge"
        style={{ '--sonar-color': ratingColor(letter) }}
        aria-label={`${label} rating: ${letter || 'not available'}`}
      >
        <span aria-hidden="true">{letter ?? '–'}</span>
      </span>
    </span>
  )
}

function RatingRow({ ratings }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <RatingBadge label="Reliability" letter={ratings.reliability} />
      <RatingBadge label="Security" letter={ratings.security} />
      <RatingBadge label="Maintainability" letter={ratings.maintainability} />
    </div>
  )
}

function MetricTile({ label, value, pct = false }) {
  return (
    <div className="sonar-metric">
      <span className="sonar-metric__value">{fmt(value, { pct })}</span>
      <span className="sonar-metric__label">{label}</span>
    </div>
  )
}

function MetricGrid({ tiles }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <MetricTile key={t.label} label={t.label} value={t.value} pct={t.pct} />
      ))}
    </div>
  )
}

function repoTiles(m) {
  return [
    { label: 'Coverage', value: m.coverage, pct: true },
    { label: 'Bugs', value: m.bugs },
    { label: 'Vulnerabilities', value: m.vulnerabilities },
    { label: 'Code Smells', value: m.code_smells },
    { label: 'Duplications', value: m.duplicated_lines_density, pct: true },
    { label: 'Hotspots', value: m.security_hotspots }
  ]
}

function prTiles(m) {
  return [
    { label: 'New Coverage', value: m.new_coverage, pct: true },
    { label: 'New Bugs', value: m.new_bugs },
    { label: 'New Vulns', value: m.new_vulnerabilities },
    { label: 'New Smells', value: m.new_code_smells },
    { label: 'New Dup.', value: m.new_duplicated_lines_density, pct: true },
    { label: 'New Hotspots', value: m.new_security_hotspots }
  ]
}

function SonarLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring text-xs font-medium text-[var(--color-primary)] underline underline-offset-2"
    >
      {label} ↗
    </a>
  )
}

/**
 * Per-repository (main branch) or per-PR (new code) code-quality panel.
 * Renders nothing when the integration is off or the repo isn't linked.
 */
export function SonarQualityPanel({ repository, prNumber }) {
  const isPr = typeof prNumber === 'number'
  const path = isPr
    ? `/api/sonar/pr?repository=${encodeURIComponent(repository)}&prNumber=${prNumber}`
    : `/api/sonar/repo?repository=${encodeURIComponent(repository)}`
  const { data, status, error } = useSonarMetrics(path)

  const title = isPr
    ? 'Code Quality · this PR (new code)'
    : 'Code Quality · main branch'

  if (status === 'loading' || status === 'idle') {
    return <Panel title={title} subtitle="SonarCloud" state="loading" />
  }
  if (status === 'error') {
    return (
      <Panel title={title} subtitle="SonarCloud" state="empty">
        <p className="text-sm text-[var(--color-text-muted)]">
          Couldn’t reach SonarCloud{error ? ` (${error})` : ''}.
        </p>
      </Panel>
    )
  }
  // Integration disabled, or this repository has no Sonar project → hide.
  if (!data || data.configured === false || data.linked === false) return null

  if (isPr && data.analyzed === false) {
    return (
      <Panel title={title} subtitle="SonarCloud" state="populated">
        <div className="flex flex-col items-start gap-2">
          <p className="m-0 text-sm text-[var(--color-text-muted)]">
            This pull request hasn’t been analysed by SonarCloud.
          </p>
          <SonarLink href={data.url} label="Open project on SonarCloud" />
        </div>
      </Panel>
    )
  }

  const tiles = isPr ? prTiles(data.measures) : repoTiles(data.measures)

  return (
    <Panel
      title={title}
      subtitle="SonarCloud"
      action={<SonarLink href={data.url} label="View on SonarCloud" />}
      state="populated"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SonarGate status={data.qualityGate} />
          <RatingRow ratings={data.ratings} />
        </div>
        <MetricGrid tiles={tiles} />
      </div>
    </Panel>
  )
}

function PortfolioHeading() {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--color-text)]">
        Code Quality
      </h2>
      <span className="text-xs text-[var(--color-text-faint)]">
        Main-branch quality gate per repository (SonarCloud)
      </span>
    </div>
  )
}

/**
 * Portfolio summary — main-branch quality-gate status across every linked
 * repository (e.g. "3 passed · 2 warning · 1 failed"). Each repo chip is a
 * button that drills into that repository. Self-hides (heading included) when
 * unconfigured/empty.
 */
export function SonarPortfolioPanel({ onOpenRepo }) {
  const { data, status, error } = useSonarMetrics('/api/sonar/overview')

  if (status === 'loading' || status === 'idle') {
    return (
      <>
        <PortfolioHeading />
        <Panel
          title="Code Quality · portfolio"
          subtitle="SonarCloud"
          state="loading"
        />
      </>
    )
  }
  if (status === 'error') {
    return (
      <>
        <PortfolioHeading />
        <Panel
          title="Code Quality · portfolio"
          subtitle="SonarCloud"
          state="empty"
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            Couldn’t reach SonarCloud{error ? ` (${error})` : ''}.
          </p>
        </Panel>
      </>
    )
  }
  // `configured:false` returns an object, a configured feed returns an array.
  if (!Array.isArray(data) || data.length === 0) return null

  const counts = data.reduce(
    (acc, r) => {
      acc[r.qualityGate] = (acc[r.qualityGate] ?? 0) + 1
      return acc
    },
    { passed: 0, warning: 0, failed: 0, none: 0 }
  )

  const summary = [
    { key: 'passed', ...gateMeta('passed'), n: counts.passed },
    { key: 'warning', ...gateMeta('warning'), n: counts.warning },
    { key: 'failed', ...gateMeta('failed'), n: counts.failed },
    { key: 'none', ...gateMeta('none'), n: counts.none }
  ].filter((s) => s.n > 0)

  return (
    <>
      <PortfolioHeading />
      <Panel
        title="Code Quality · portfolio"
        subtitle="Main-branch quality gate per repository (SonarCloud)"
        state="populated"
      >
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-wrap gap-3"
            role="list"
            aria-label="Quality gate summary"
          >
            {summary.map((s) => (
              <div
                key={s.key}
                role="listitem"
                className="sonar-gate"
                style={{ '--sonar-color': s.color }}
              >
                <span className="text-base font-bold tabular-nums">{s.n}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((r) => {
              const meta = gateMeta(r.qualityGate)
              return (
                <li key={r.repository}>
                  <button
                    type="button"
                    onClick={() => onOpenRepo?.(r.repository)}
                    className="drill-row focus-ring flex w-full items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-left"
                  >
                    <span className="truncate text-sm font-medium text-[var(--color-text)]">
                      {shortRepoName(r.repository)}
                    </span>
                    <span
                      className="sonar-gate shrink-0"
                      style={{ '--sonar-color': meta.color }}
                    >
                      <span aria-hidden="true">{meta.icon}</span>
                      <span>{meta.label}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </Panel>
    </>
  )
}
