import { useMemo, useState } from 'react'
import { Panel } from '../Panel'
import { KpiCard } from '../charts/KpiCard'
import { DistributionDonut } from '../charts/DistributionDonut'
import { CategoryBar } from '../charts/CategoryBar'
import { ActivityHeatmap } from '../charts/ActivityHeatmap'
import { ProfileRadar } from '../charts/ProfileRadar'
import { LiveCommitStream } from '../charts/LiveCommitStream'
import { SonarPortfolioPanel } from '../charts/SonarQuality'
import {
  selectGlobalSummary,
  selectRepoSummaries,
  selectContributorSummaries,
  selectContributorRepoMatrix,
  selectDeliverySummary,
  selectDeliveryMetrics,
  selectCommitTimeline,
  selectRepoProfiles,
  selectRepoRework,
  selectCopilotLeverage,
  selectPersonaSummaries,
  formatDuration
} from '../../lib/selectors'

function SectionHeading({ children, hint }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--color-text)]">
        {children}
      </h2>
      {hint && (
        <span className="text-xs text-[var(--color-text-faint)]">{hint}</span>
      )}
    </div>
  )
}

/** Reusable collapsible breakdown panel below a KPI card. */
function AccordionSection({ id, title, subtitle, children, className = '' }) {
  return (
    <section
      id={id}
      className={`accordion-panel ${className}`.trim()}
      aria-label={title}
    >
      <div className="border-b border-[var(--color-border)] px-5 py-3">
        <h3 className="m-0 text-sm font-semibold text-[var(--color-text)]">
          {title}
        </h3>
        {subtitle && (
          <p className="m-0 text-xs text-[var(--color-text-muted)]">
            {subtitle}
          </p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

/**
 * Level 1 — Global overview. Sections are ordered so insight widens then
 * narrows: portfolio (all repos) → per-repository → per-contributor → the live
 * commit stream → the contributor × repository heatmap. Pull-request detail is
 * intentionally deferred to the repository drill-down. Clicking a Copilot KPI
 * card reveals a per-repository breakdown accordion.
 */
export function OverviewView({
  payloads,
  allPayloads,
  windowKey,
  mappingsByHandle,
  onOpenRepo,
  onOpenRepoCycle,
  onOpenContributor
}) {
  const history = allPayloads ?? payloads
  const summary = useMemo(() => selectGlobalSummary(payloads), [payloads])
  const delivery = useMemo(
    () => selectDeliverySummary(payloads, history),
    [payloads, history]
  )
  const repos = useMemo(() => selectRepoSummaries(payloads), [payloads])
  const contributors = useMemo(
    () => selectContributorSummaries(payloads),
    [payloads]
  )
  const matrix = useMemo(
    () => selectContributorRepoMatrix(payloads),
    [payloads]
  )
  const timeline = useMemo(() => selectCommitTimeline(payloads), [payloads])
  const deliveryByPr = useMemo(
    () => selectDeliveryMetrics(payloads),
    [payloads]
  )
  const repoProfiles = useMemo(() => selectRepoProfiles(payloads), [payloads])
  const rework = useMemo(() => selectRepoRework(payloads), [payloads])
  const leverage = useMemo(
    () => selectCopilotLeverage(payloads, history),
    [payloads, history]
  )
  const personas = useMemo(
    () => selectPersonaSummaries(payloads, mappingsByHandle),
    [payloads, mappingsByHandle]
  )

  // Average cycle time per repository (portfolio → repo, never per-PR here;
  // per-PR detail lives on the dedicated repo cycle-time page).
  const repoCycle = useMemo(() => {
    const byRepo = new Map()
    for (const m of deliveryByPr) {
      if (!byRepo.has(m.repository)) {
        byRepo.set(m.repository, {
          repository: m.repository,
          name: m.repoName,
          cycles: [],
          prCount: 0
        })
      }
      const r = byRepo.get(m.repository)
      if (m.cycleHours > 0) r.cycles.push(m.cycleHours)
      r.prCount += 1
    }
    return Array.from(byRepo.values())
      .map((r) => ({
        repository: r.repository,
        name: r.name,
        prCount: r.prCount,
        avgCycleHours: r.cycles.length
          ? r.cycles.reduce((a, b) => a + b, 0) / r.cycles.length
          : 0,
        fastest: r.cycles.length ? Math.min(...r.cycles) : 0,
        slowest: r.cycles.length ? Math.max(...r.cycles) : 0
      }))
      .sort((a, b) => a.avgCycleHours - b.avgCycleHours)
  }, [deliveryByPr])

  const [openPanel, setOpenPanel] = useState(null)
  const toggle = (id) => setOpenPanel((v) => (v === id ? null : id))
  // A card is dimmed/disabled whenever a different card's breakdown is open.
  const dim = (id) => openPanel !== null && openPanel !== id

  return (
    <div className="flex flex-col gap-4">
      {/* ─────────────── 0 · LIVE COMMIT STREAM ─────────────── */}
      <SectionHeading hint="Replaying the commit timeline as a simulated live feed">
        Live commit stream
      </SectionHeading>

      <Panel
        title="Commit Stream"
        subtitle="Lines touched per commit · coloured by Copilot-assisted vs manual · replays the selected time window"
      >
        {/* Remount (restart the replay) when the time-window filter changes,
            but not when live data merely appends to the same window. */}
        <LiveCommitStream key={windowKey} timeline={timeline} />
      </Panel>

      {/* ─────────────── 1 · KEY METRICS ─────────────── */}
      <SectionHeading hint="Portfolio-level headline KPIs">
        Key Metrics
      </SectionHeading>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Copilot Adoption"
          value={delivery.adoptionPct}
          unit="%"
          accent="var(--color-success)"
          icon="◐"
          footnote={`${delivery.adopters} of ${delivery.contributorTotal} contributors`}
          info="Share of contributors who made at least one Copilot-assisted commit (Rebase commits excluded)."
          onClick={() => toggle('adoption')}
          expanded={openPanel === 'adoption'}
          controls="accordion-adoption"
          dimmed={dim('adoption')}
        />
        {openPanel === 'adoption' && (
          <AccordionSection
            id="accordion-adoption"
            className="col-span-full"
            title="Copilot adoption — contributor breakdown"
            subtitle="How many contributors used Copilot in each repository"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {repos.map((r) => (
                <div
                  key={r.repository}
                  className="kpi-card"
                  style={{ '--kpi-accent': 'var(--color-success)' }}
                >
                  <span
                    className="kpi-card__accent"
                    aria-hidden="true"
                    style={{ background: 'var(--color-success)' }}
                  />
                  <p
                    className="m-0 truncate text-xs font-semibold text-[var(--color-text)]"
                    title={r.name}
                  >
                    {r.name}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      Contributors
                    </span>
                    <span className="text-2xl font-semibold text-[var(--color-success)]">
                      {r.contributorCount}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Pull requests
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.prCount}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Total commits
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.totalCommits}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Copilot commits
                    </span>
                    <span className="font-medium text-[var(--color-copilot)]">
                      {r.copilotAssistedCommits}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        )}

        <KpiCard
          label="Avg Cycle Time"
          value={formatDuration(delivery.avgCycleHours)}
          accent="var(--color-primary)"
          icon="⏱"
          footnote={`Median ${formatDuration(delivery.medianCycleHours)} · fastest ${formatDuration(delivery.fastestCycleHours)}`}
          info="Average hours from a PR's first commit to its last. Lower means faster delivery."
          onClick={() => toggle('cycletime')}
          expanded={openPanel === 'cycletime'}
          controls="accordion-cycletime"
          dimmed={dim('cycletime')}
        />
        {openPanel === 'cycletime' && (
          <AccordionSection
            id="accordion-cycletime"
            className="col-span-full"
            title="Average cycle time — per repository"
            subtitle="Click a repository to open its pull requests plotted against cycle time"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {repoCycle.map((r) => (
                <button
                  key={r.repository}
                  type="button"
                  onClick={() => onOpenRepoCycle(r.repository)}
                  className="kpi-card kpi-card--button focus-ring text-left"
                  style={{ '--kpi-accent': 'var(--color-primary)' }}
                  aria-label={`Open cycle-time detail for ${r.name}`}
                >
                  <span
                    className="kpi-card__accent"
                    aria-hidden="true"
                    style={{ background: 'var(--color-primary)' }}
                  />
                  <p
                    className="m-0 truncate text-xs font-semibold text-[var(--color-text)]"
                    title={r.name}
                  >
                    {r.name}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      Avg cycle time
                    </span>
                    <span className="text-2xl font-semibold text-[var(--color-primary)]">
                      {formatDuration(r.avgCycleHours)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Fastest
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {formatDuration(r.fastest)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Slowest
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {formatDuration(r.slowest)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Pull requests
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.prCount}
                    </span>
                  </div>
                  <p className="mt-2 text-right text-xs font-medium text-[var(--color-primary)]">
                    View PR cycle times →
                  </p>
                </button>
              ))}
            </div>
          </AccordionSection>
        )}

        <KpiCard
          label="Copilot Leverage"
          value={delivery.copilotLeverage}
          unit="%"
          accent="var(--color-info)"
          icon="⚡"
          footnote={
            delivery.leverageFlowAvailable
              ? `Coverage ${delivery.leverageCoverage}% · Adoption ${delivery.leverageAdoption}% · Copilot ${delivery.leverageFlowRatio}× faster than historical baseline`
              : `Coverage ${delivery.leverageCoverage}% · Adoption ${delivery.leverageAdoption}% · speed: no baseline yet`
          }
          info="0–100 score blending Copilot code coverage, current delivery speed vs. a historical manually-led baseline, and adoption. Read alongside Rework."
          onClick={() => toggle('leverage')}
          expanded={openPanel === 'leverage'}
          controls="accordion-leverage"
          dimmed={dim('leverage')}
        />
        {openPanel === 'leverage' && (
          <AccordionSection
            id="accordion-leverage"
            className="col-span-full"
            title="Copilot leverage — per repository"
            subtitle={`Coverage × Efficiency × Adoption (geometric mean, 0–100) · Efficiency = current Copilot speed vs. a historical manually-led baseline · Rework guardrail: ${delivery.reworkRatio}`}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {leverage.repos.map((r) => (
                <div
                  key={r.repository}
                  className="kpi-card"
                  style={{ '--kpi-accent': 'var(--color-info)' }}
                >
                  <span
                    className="kpi-card__accent"
                    aria-hidden="true"
                    style={{ background: 'var(--color-info)' }}
                  />
                  <p
                    className="m-0 truncate text-xs font-semibold text-[var(--color-text)]"
                    title={r.name}
                  >
                    {r.name}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      Leverage
                    </span>
                    <span className="text-2xl font-semibold text-[var(--color-info)]">
                      {r.leveragePct}%
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Coverage
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.coverage}%
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Efficiency (Flow)
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.efficiency}%
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Adoption
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.adoption}%
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Speed vs. baseline
                    </span>
                    <span className="font-medium text-[var(--color-copilot)]">
                      {r.flowAvailable
                        ? `${r.flowRatio}× faster`
                        : 'No baseline yet'}
                    </span>
                    {r.flowAvailable && (
                      <>
                        <span className="text-[var(--color-text-muted)]">
                          Median cycle (Copilot now / baseline)
                        </span>
                        <span className="font-medium text-[var(--color-text)]">
                          {formatDuration(r.copilotMedianCycleHours)} /{' '}
                          {formatDuration(r.baselineMedianCycleHours)}
                        </span>
                        <span className="text-[var(--color-text-muted)]">
                          Baseline source
                        </span>
                        <span className="font-medium text-[var(--color-text)]">
                          {r.baselineLocal
                            ? `This repo (${r.baselineCount} historical PRs)`
                            : `Portfolio-wide (${r.baselineCount} PRs)`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        )}
      </div>

      {/* ─────────────── 2 · REPOSITORY METRICS ─────────────── */}
      <SectionHeading hint="Assist share and delivery quality across the portfolio">
        Repository Metrics
      </SectionHeading>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Copilot Assist Rate"
          value={summary.copilotAssistedRate}
          unit="%"
          accent="var(--color-copilot)"
          icon="✦"
          footnote={`${summary.copilotAssistedCommits} of ${summary.totalCommits} commits`}
          info="Share of commits that are Copilot-assisted (Rebase/merge commits excluded)."
          onClick={() => toggle('assist')}
          expanded={openPanel === 'assist'}
          controls="accordion-assist"
          dimmed={dim('assist')}
        />
        {openPanel === 'assist' && (
          <AccordionSection
            id="accordion-assist"
            className="col-span-full"
            title="Copilot assist rate — per repository"
            subtitle="Commit-level and line-level Copilot assist share · click a repository to drill in"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {repos.map((r) => (
                <button
                  key={r.repository}
                  type="button"
                  onClick={() => onOpenRepo(r.repository)}
                  className="kpi-card kpi-card--button focus-ring text-left"
                  style={{ '--kpi-accent': 'var(--color-copilot)' }}
                  aria-label={`Open ${r.name}`}
                >
                  <span
                    className="kpi-card__accent"
                    aria-hidden="true"
                    style={{ background: 'var(--color-copilot)' }}
                  />
                  <p
                    className="m-0 truncate text-xs font-semibold text-[var(--color-text)]"
                    title={r.name}
                  >
                    {r.name}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      Commit assist
                    </span>
                    <span className="font-semibold text-[var(--color-copilot)]">
                      {r.copilotAssistedRate}%
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Line assist
                    </span>
                    <span className="font-semibold text-[var(--color-accent)]">
                      {r.copilotAssistedLineRate}%
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Copilot commits
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.copilotAssistedCommits} / {r.totalCommits}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Copilot lines
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.copilotAssistedLines.toLocaleString()} /{' '}
                      {r.totalLinesTouched.toLocaleString()}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Pull requests
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.prCount}
                    </span>
                  </div>
                  <p className="mt-2 text-right text-xs font-medium text-[var(--color-primary)]">
                    View repo →
                  </p>
                </button>
              ))}
            </div>
          </AccordionSection>
        )}

        <KpiCard
          label="Copilot Line Rate"
          value={summary.copilotAssistedLineRate}
          unit="%"
          accent="var(--color-accent)"
          icon="≣"
          footnote={`${summary.copilotAssistedLines.toLocaleString()} of ${summary.totalLinesTouched.toLocaleString()} lines`}
          info="Share of lines touched by Copilot-assisted commits (Rebase/merge commits excluded)."
          onClick={() => toggle('linerate')}
          expanded={openPanel === 'linerate'}
          controls="accordion-linerate"
          dimmed={dim('linerate')}
        />
        {openPanel === 'linerate' && (
          <AccordionSection
            id="accordion-linerate"
            className="col-span-full"
            title="Copilot line rate — per repository"
            subtitle="Lines touched: Copilot-assisted vs manual"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {repos.map((r) => (
                <div
                  key={r.repository}
                  className="kpi-card"
                  style={{ '--kpi-accent': 'var(--color-accent)' }}
                >
                  <span
                    className="kpi-card__accent"
                    aria-hidden="true"
                    style={{ background: 'var(--color-accent)' }}
                  />
                  <p
                    className="m-0 truncate text-xs font-semibold text-[var(--color-text)]"
                    title={r.name}
                  >
                    {r.name}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      Line assist
                    </span>
                    <span className="text-2xl font-semibold text-[var(--color-accent)]">
                      {r.copilotAssistedLineRate}%
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Copilot lines
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.copilotAssistedLines.toLocaleString()}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Human-authored lines
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.humanAuthoredLines.toLocaleString()}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Total touched
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.totalLinesTouched.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        )}

        <KpiCard
          label="Avg Batch Size"
          value={delivery.avgCommitSize}
          unit="lines"
          accent="var(--color-warning)"
          icon="▤"
          footnote="Lines touched per commit — smaller is safer"
          info="Average lines touched per commit (Rebase excluded). Smaller commits are easier to review and safer to revert."
          dimmed={dim('batch')}
        />
        <KpiCard
          label="Rework Ratio"
          value={delivery.reworkRatio}
          accent="var(--color-danger)"
          icon="↺"
          footnote={`${delivery.linesDeleted.toLocaleString()} deleted / ${delivery.linesAdded.toLocaleString()} added`}
          info="Lines deleted ÷ lines added (Rebase excluded). Lower means less freshly-added code was rewritten."
          onClick={() => toggle('rework')}
          expanded={openPanel === 'rework'}
          controls="accordion-rework"
          dimmed={dim('rework')}
        />
        {openPanel === 'rework' && (
          <AccordionSection
            id="accordion-rework"
            className="col-span-full"
            title="Rework ratio — per repository"
            subtitle="Deleted ÷ added lines, calculated separately per repository (Rebase/merge commits excluded); the portfolio ratio is these values weighted by lines added"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rework.repos.map((r) => (
                <div
                  key={r.repository}
                  className="kpi-card"
                  style={{ '--kpi-accent': 'var(--color-danger)' }}
                >
                  <span
                    className="kpi-card__accent"
                    aria-hidden="true"
                    style={{ background: 'var(--color-danger)' }}
                  />
                  <p
                    className="m-0 truncate text-xs font-semibold text-[var(--color-text)]"
                    title={r.name}
                  >
                    {r.name}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      Rework ratio
                    </span>
                    <span className="text-2xl font-semibold text-[var(--color-danger)]">
                      {r.reworkRatio}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Lines added
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.linesAdded.toLocaleString()}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Lines deleted
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.linesDeleted.toLocaleString()}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Pull requests
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {r.prCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        )}
        <KpiCard
          label="Net Lines Delivered"
          value={delivery.netLines.toLocaleString()}
          accent="var(--color-success)"
          icon="Σ"
          footnote={`${delivery.linesAdded.toLocaleString()} added − ${delivery.linesDeleted.toLocaleString()} deleted`}
          info="Lines added minus lines deleted across non-Rebase commits — the net code delivered."
          onClick={() => toggle('netlines')}
          expanded={openPanel === 'netlines'}
          controls="accordion-netlines"
          dimmed={dim('netlines')}
        />
        {openPanel === 'netlines' && (
          <AccordionSection
            id="accordion-netlines"
            className="col-span-full"
            title="Net lines delivered — per repository"
            subtitle="Net lines = lines added − lines deleted, per repository (Rebase/merge commits excluded)"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rework.repos.map((r) => (
                <div
                  key={r.repository}
                  className="kpi-card"
                  style={{ '--kpi-accent': 'var(--color-success)' }}
                >
                  <span
                    className="kpi-card__accent"
                    aria-hidden="true"
                    style={{ background: 'var(--color-success)' }}
                  />
                  <p
                    className="m-0 truncate text-xs font-semibold text-[var(--color-text)]"
                    title={r.name}
                  >
                    {r.name}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      Net lines
                    </span>
                    <span className="text-2xl font-semibold text-[var(--color-success)]">
                      {(r.linesAdded - r.linesDeleted).toLocaleString()}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Added
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      +{r.linesAdded.toLocaleString()}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      Deleted
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      −{r.linesDeleted.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        )}
      </div>

      {/* Composition donuts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Commit Composition" subtitle="Across all repositories">
          <DistributionDonut
            title="Commit Composition"
            data={[
              {
                name: 'Copilot-assisted',
                value: summary.copilotAssistedCommits
              },
              { name: 'Human-authored', value: summary.humanAuthoredCommits }
            ]}
          />
        </Panel>
        <Panel title="Line Composition" subtitle="Across all repositories">
          <DistributionDonut
            title="Line Composition"
            data={[
              { name: 'Copilot-assisted', value: summary.copilotAssistedLines },
              { name: 'Human-authored', value: summary.humanAuthoredLines }
            ]}
          />
        </Panel>
      </div>

      {/* ─────────────── PERSONA / ROLE INSIGHTS ─────────────── */}
      <SectionHeading hint="Copilot impact grouped by each contributor's role">
        Persona / role insights
      </SectionHeading>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {personas.map((persona) => (
          <section
            key={persona.id}
            className="kpi-card"
            style={{ '--kpi-accent': persona.accent }}
            aria-label={`${persona.label} — Copilot delivery metrics`}
          >
            <span
              className="kpi-card__accent"
              aria-hidden="true"
              style={{ background: persona.accent }}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="text-lg font-semibold"
                  style={{ color: persona.accent }}
                >
                  {persona.icon}
                </span>
                <p className="m-0 text-sm font-semibold text-[var(--color-text)]">
                  {persona.label}
                </p>
              </div>
              <span
                className="pill"
                style={{ color: persona.accent, borderColor: persona.accent }}
              >
                {persona.repoCount} {persona.repoCount === 1 ? 'repo' : 'repos'}
              </span>
            </div>

            {persona.repoCount === 0 || persona.totalCommits === 0 ? (
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                No activity from this role in the selected window.
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <span className="text-[var(--color-text-muted)]">
                    Copilot adoption
                  </span>
                  <span
                    className="text-2xl font-semibold tabular-nums"
                    style={{ color: persona.accent }}
                  >
                    {persona.adoptionPct}%
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    Commit assist rate
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--color-copilot)]">
                    {persona.copilotAssistedRate}%
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    Line assist rate
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--color-accent)]">
                    {persona.copilotAssistedLineRate}%
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    Contributors (adopters)
                  </span>
                  <span className="font-medium tabular-nums text-[var(--color-text)]">
                    {persona.contributorCount} ({persona.adopters})
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    Pull requests
                  </span>
                  <span className="font-medium tabular-nums text-[var(--color-text)]">
                    {persona.prCount}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    Copilot commits
                  </span>
                  <span className="font-medium tabular-nums text-[var(--color-text)]">
                    {persona.copilotAssistedCommits} / {persona.totalCommits}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    Net lines delivered
                  </span>
                  <span className="font-medium tabular-nums text-[var(--color-text)]">
                    {persona.netLines.toLocaleString()}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    Avg cycle time
                  </span>
                  <span className="font-medium tabular-nums text-[var(--color-text)]">
                    {formatDuration(persona.avgCycleHours)}
                  </span>
                </div>
                <p
                  className="mt-3 truncate text-xs text-[var(--color-text-faint)]"
                  title={persona.repoNames.join(', ')}
                >
                  {persona.repoNames.join(' · ')}
                </p>
              </>
            )}
          </section>
        ))}
      </div>

      {/* ─────────────── 2 · CODE QUALITY ─────────────── */}
      <SonarPortfolioPanel onOpenRepo={onOpenRepo} />

      {/* ─────────────── 3 · REPOSITORY-LEVEL INSIGHTS ─────────────── */}
      <SectionHeading hint="Drill into a repository to see its pull requests">
        Repository-level insights
      </SectionHeading>

      <Panel
        title="Repository Delivery Profile"
        subtitle="Each axis normalised to 0–100 (higher is better) · click a repository to drill in"
      >
        <ProfileRadar
          title="Repository delivery profile"
          subtitle="Commit assist, line assist, adoption, delivery speed and rework control per repository."
          indicators={repoProfiles.indicators}
          series={repoProfiles.repos}
          onSelect={(key) => onOpenRepo(key)}
        />
      </Panel>

      <Panel
        title="Assist Rate by Repository"
        subtitle="Click a repository to drill into its pull requests"
      >
        <CategoryBar
          title="Assist Rate by Repository"
          categories={repos.map((r) => r.name)}
          values={repos.map((r) => r.copilotAssistedRate)}
          seriesName="assist rate"
          unit="%"
          colorByValue
          onSelect={(i) => onOpenRepo(repos[i].repository)}
        />
      </Panel>

      {/* ─────────────── 3 · CONTRIBUTOR-LEVEL INSIGHTS ─────────────── */}
      <SectionHeading hint="Click a contributor to see their PRs across repositories">
        Contributor-level insights
      </SectionHeading>

      <Panel
        title="Assist Rate by Contributor"
        subtitle="Click a contributor to see their PRs across repos"
      >
        <CategoryBar
          title="Assist Rate by Contributor"
          categories={contributors.map((c) => c.contributor)}
          values={contributors.map((c) => c.copilotAssistedRate)}
          seriesName="assist rate"
          unit="%"
          colorByValue
          onSelect={(i) => onOpenContributor(contributors[i].contributor)}
        />
      </Panel>

      {/* ─────────────── 4 · CONTRIBUTOR × REPOSITORY HEATMAP ─────────────── */}
      <SectionHeading hint="Spot adoption gaps across the team">
        Contributor × repository heatmap
      </SectionHeading>

      <Panel
        title="Contributor × Repository"
        subtitle="Assist rate heatmap — green means higher Copilot adoption, pale blue means lower"
      >
        <ActivityHeatmap
          title="Assist rate by contributor and repository"
          xLabels={matrix.repos}
          yLabels={matrix.contributors}
          data={matrix.data}
        />
      </Panel>
    </div>
  )
}
