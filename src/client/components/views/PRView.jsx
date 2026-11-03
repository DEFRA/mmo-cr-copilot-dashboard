import { useId, useMemo } from 'react'

import {
  ChartFigure,
  KpiCard,
  MiniBars,
  Panel,
  PanelState,
  ProgressRing
} from '../dashboard'
import { Tag } from '../govuk'
import { CommitLog } from '../CommitLog'
import { CopilotUsagePanel } from '../CopilotUsagePanel'
import { CategoryBar } from '../charts/CategoryBar'
import { DistributionDonut } from '../charts/DistributionDonut'
import { HotspotScatter } from '../charts/HotspotScatter'
import { SonarQualityGatePanel } from '../charts/SonarQuality'
import { LinkedJiraTickets } from '../LinkedJiraTickets'
import { StackedBar } from '../charts/StackedBar'
import {
  computePrMetrics,
  formatDuration,
  hoursBetween,
  isMergedPayload,
  selectCopilotUsage,
  selectPrCommitLines,
  selectRepoContributors,
  shortRepoName
} from '../../lib/selectors'
import { ScopeHeader, lines, plural } from './scope.jsx'

const NO_COMMITS = []

function MetaRow({ label, children }) {
  return (
    <div className="app-stat-list__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const formatWhen = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—'

/**
 * Pull request overview then its commits, the last two levels of the cascade
 * (docs/design-system.md §8.4). Commits are the leaf of the drill-down.
 */
export function PRView({
  payloads,
  repository,
  prNumber,
  onOpenContributor,
  onChangeClassification,
  canReclassify = false,
  projectSlug
}) {
  const prId = useId()
  const commitsId = useId()
  const name = shortRepoName(repository)

  const pr = useMemo(
    () =>
      payloads.find(
        (p) => p.repository === repository && p.prNumber === prNumber
      ),
    [payloads, repository, prNumber]
  )
  const commits = pr?.commitBreakdown ?? NO_COMMITS
  const m = useMemo(() => (pr ? computePrMetrics(pr) : null), [pr])
  const counted = useMemo(() => selectPrCommitLines(pr), [pr])
  const usage = useMemo(() => (pr ? selectCopilotUsage([pr]) : null), [pr])
  const contributors = useMemo(
    () => (pr ? selectRepoContributors([pr], repository) : []),
    [pr, repository]
  )

  if (!pr || !m) {
    return (
      <section className="app-scope" aria-labelledby={prId}>
        <ScopeHeader
          id={prId}
          level="Drill-down"
          icon="merge"
          title="Pull request overview"
          meta={`${name} · #${prNumber}`}
        />
        <Panel title="Pull request" family="leverage" icon="merge">
          <PanelState
            state="empty"
            title="Pull request"
            icon="merge"
            emptyMessage="This pull request is not in the selected period."
          />
        </Panel>
      </section>
    )
  }

  const merged = isMergedPayload(pr)
  const cycleHours = hoursBetween(pr.firstCommitAt, pr.lastCommitAt)
  const excluded = m.rebaseCommits + m.dependabotCommits
  const label = `pull request ${prNumber}`
  const largest = counted.reduce(
    (max, c) => (c.touched > (max?.touched ?? -1) ? c : max),
    null
  )

  const kpis = [
    {
      label: 'Commit assist rate',
      family: 'assist',
      icon: 'sparkle',
      value: String(m.copilotAssistedRate),
      unit: '%',
      sub: `${m.copilotAssistedCommits} of ${plural(m.totalCommits, 'commit')}`,
      chart: <ProgressRing value={m.copilotAssistedRate} />
    },
    {
      label: 'Line assist rate',
      family: 'assist',
      icon: 'code',
      value: String(m.copilotAssistedLineRate),
      unit: '%',
      sub: `${lines(m.copilotAssistedLines)} of ${lines(m.totalLinesTouched)} lines`,
      chart: <ProgressRing value={m.copilotAssistedLineRate} />
    },
    {
      label: 'Lines touched',
      family: 'output',
      icon: 'plusminus',
      value: lines(m.totalLinesTouched),
      sub: `${lines(m.linesAdded)} added · ${lines(m.linesDeleted)} deleted`,
      chart: <MiniBars data={counted.map((c) => c.touched)} />
    },
    {
      label: 'PR coding cycle time',
      family: 'speed',
      icon: 'clock',
      value: formatDuration(cycleHours),
      sub: 'First commit to last commit'
    }
  ]

  return (
    <>
      <section className="app-scope" aria-labelledby={prId}>
        <ScopeHeader
          id={prId}
          level="Drill-down"
          icon="merge"
          title="Pull request overview"
          meta={`${name} · #${prNumber} · ${merged ? 'merged' : 'open'}`}
        />

        <div className="app-kpi-grid">
          {kpis.map((kpi, index) => (
            <KpiCard key={kpi.label} {...kpi} index={index} />
          ))}
        </div>

        <div className="app-grid govuk-!-margin-top-5">
          <div className="app-span-6">
            <Panel
              title="Branch and timeline"
              family="leverage"
              icon="branch"
              aside={
                <span className="app-mini-tag">
                  {pr.sourceBranch
                    ? `${pr.sourceBranch} → ${pr.targetBranch}`
                    : `→ ${pr.targetBranch}`}
                </span>
              }
            >
              <dl className="app-stat-list">
                <MetaRow label="Status">
                  {merged ? (
                    <Tag colour="green">Merged</Tag>
                  ) : (
                    <Tag colour="blue">Open</Tag>
                  )}
                </MetaRow>
                <MetaRow label="Contributors">
                  {contributors.map((c) => c.contributor).join(', ') || '—'}
                </MetaRow>
                <MetaRow label="First commit">
                  {formatWhen(pr.firstCommitAt)}
                </MetaRow>
                <MetaRow label={merged ? 'Merged' : 'Last commit'}>
                  {formatWhen(merged ? pr.prMergedAt : pr.lastCommitAt)}
                </MetaRow>
                <MetaRow label="Build">{pr.buildId ?? '—'}</MetaRow>
                <MetaRow label="Excluded">
                  {excluded
                    ? plural(excluded, 'rebase or Dependabot commit')
                    : 'None'}
                </MetaRow>
              </dl>
            </Panel>
            {projectSlug && (
              <LinkedJiraTickets
                projectSlug={projectSlug}
                repository={repository}
                prNumber={prNumber}
                payloadKeys={
                  Array.isArray(pr.jiraKeys)
                    ? pr.jiraKeys.filter((k) => typeof k === 'string')
                    : []
                }
                canEdit={canReclassify}
              />
            )}
          </div>
          <div className="app-span-6">
            <SonarQualityGatePanel
              repository={repository}
              prNumber={prNumber}
            />
          </div>
        </div>
        {usage.models.length > 0 && (
          <div className="govuk-!-margin-top-5">
            <CopilotUsagePanel usage={usage} />
          </div>
        )}
      </section>

      <section className="app-scope" aria-labelledby={commitsId}>
        <ScopeHeader
          id={commitsId}
          level="Detail"
          icon="commit"
          title="Commits"
          meta={`${plural(commits.length, 'commit')} · ${m.totalCommits} counted · ${excluded} excluded`}
        />

        <div className="app-grid">
          <ChartFigure
            number={1}
            title="Lines touched per commit"
            subtitle={`Lines touched per counted commit by classification, oldest to newest, ${label}. Rebase and Dependabot commits are excluded.`}
            description={
              largest
                ? `The largest commit, ${largest.commit}, touched ${lines(largest.touched)} lines and was ${largest.category}.`
                : undefined
            }
            family="leverage"
            icon="bars"
            chip="Oldest to newest"
            className="app-span-12"
            columns={[
              { id: 'commit', label: 'Commit' },
              { id: 'subject', label: 'Subject' },
              { id: 'copilot', label: 'Copilot-assisted lines', numeric: true },
              { id: 'human', label: 'Human-authored lines', numeric: true }
            ]}
            rows={counted.map((c) => [c.commit, c.subject, c.copilot, c.human])}
          >
            <StackedBar
              title="Lines touched per commit"
              categories={counted.map((c) => c.commit)}
              series={[
                {
                  name: 'Copilot-assisted',
                  colorToken: 'copilot',
                  data: counted.map((c) => c.copilot)
                },
                {
                  name: 'Human-authored',
                  colorToken: 'manual',
                  data: counted.map((c) => c.human)
                }
              ]}
            />
          </ChartFigure>
          <ChartFigure
            number={2}
            title="Lines Added and Deleted per Commit"
            subtitle={`Lines added against lines deleted per counted commit, sized by lines touched, ${label}`}
            description={`${plural(counted.length, 'counted commit')}. Commits far from the origin are the largest changes.`}
            family="risk"
            icon="scatter"
            className="app-span-6"
            columns={[
              { id: 'commit', label: 'Commit' },
              { id: 'added', label: 'Lines added', numeric: true },
              { id: 'deleted', label: 'Lines deleted', numeric: true },
              { id: 'class', label: 'Classification' }
            ]}
            rows={counted.map((c) => [
              c.commit,
              c.added,
              c.deleted,
              c.category
            ])}
          >
            <HotspotScatter
              title="Lines added and deleted per commit"
              points={counted.map((c) => ({
                x: c.added,
                y: c.deleted,
                size: c.touched,
                category: c.category,
                label: c.commit
              }))}
              xName="Lines added"
              yName="Lines deleted"
            />
          </ChartFigure>
          <ChartFigure
            number={3}
            title="Commit assist rate by contributor"
            subtitle={`Commit assist rate by contributor, percentage, ${label}`}
            description={contributors
              .map(
                (c) =>
                  `${c.contributor}: ${c.assisted} of ${c.total} commits Copilot-assisted (${c.rate}%).`
              )
              .join(' ')}
            family="adoption"
            icon="users"
            className="app-span-6"
            columns={[
              { id: 'who', label: 'Contributor' },
              { id: 'commits', label: 'Commits', numeric: true },
              {
                id: 'assisted',
                label: 'Copilot-assisted commits',
                numeric: true
              },
              { id: 'rate', label: 'Commit assist rate (%)', numeric: true }
            ]}
            rows={contributors.map((c) => [
              c.contributor,
              c.total,
              c.assisted,
              c.rate
            ])}
          >
            <CategoryBar
              title="Commit assist rate by contributor"
              categories={contributors.map((c) => c.contributor)}
              values={contributors.map((c) => c.rate)}
              seriesName="commit assist rate"
              unit="%"
              colorByValue
              onSelect={(i) => onOpenContributor(contributors[i].contributor)}
            />
          </ChartFigure>
          <ChartFigure
            number={4}
            title="Commit composition"
            subtitle={`Counted commits by classification, ${label}`}
            description={`${m.copilotAssistedCommits} of ${m.totalCommits} commits (${m.copilotAssistedRate}%) were Copilot-assisted. Rebase and Dependabot commits are excluded.`}
            family="assist"
            icon="donut"
            className="app-span-6"
            columns={[
              { id: 'class', label: 'Classification' },
              { id: 'commits', label: 'Commits', numeric: true }
            ]}
            rows={
              m.totalCommits
                ? [
                    ['Copilot-assisted', m.copilotAssistedCommits],
                    ['Human-authored', m.humanAuthoredCommits]
                  ]
                : []
            }
          >
            <DistributionDonut
              title="Commit composition"
              data={[
                { name: 'Copilot-assisted', value: m.copilotAssistedCommits },
                { name: 'Human-authored', value: m.humanAuthoredCommits }
              ]}
            />
          </ChartFigure>
          <ChartFigure
            number={5}
            title="Line composition"
            subtitle={`Lines touched by classification, ${label}`}
            description={`${lines(m.copilotAssistedLines)} of ${lines(m.totalLinesTouched)} lines touched (${m.copilotAssistedLineRate}%) were in Copilot-assisted commits.`}
            family="assist"
            icon="donut"
            className="app-span-6"
            columns={[
              { id: 'class', label: 'Classification' },
              { id: 'lines', label: 'Lines touched', numeric: true }
            ]}
            rows={
              m.totalLinesTouched
                ? [
                    ['Copilot-assisted', m.copilotAssistedLines],
                    ['Human-authored', m.humanAuthoredLines]
                  ]
                : []
            }
          >
            <DistributionDonut
              title="Line composition"
              data={[
                { name: 'Copilot-assisted', value: m.copilotAssistedLines },
                { name: 'Human-authored', value: m.humanAuthoredLines }
              ]}
            />
          </ChartFigure>
        </div>

        <div className="govuk-!-margin-top-5">
          <CommitLog
            repository={repository}
            prNumber={prNumber}
            commits={commits}
            editable={merged}
            canReclassify={canReclassify}
            onChangeClassification={onChangeClassification}
          />
        </div>
      </section>
    </>
  )
}
