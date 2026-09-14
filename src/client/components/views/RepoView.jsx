import { useMemo } from 'react'
import { Panel } from '../Panel'
import { KpiCard } from '../charts/KpiCard'
import { DistributionDonut } from '../charts/DistributionDonut'
import { CategoryBar } from '../charts/CategoryBar'
import { StackedBar } from '../charts/StackedBar'
import { HotspotScatter } from '../charts/HotspotScatter'
import { DeliveryTimeBar } from '../charts/DeliveryTimeBar'
import { SonarQualityPanel } from '../charts/SonarQuality'
import {
  selectRepoPRs,
  selectRepoSummaries,
  selectDeliveryMetrics,
  computePrMetrics,
  effectiveClassification,
  isPlottableCommit,
  shortRepoName
} from '../../lib/selectors'

/**
 * Level 2 — Single repository. Summarises the repo, ranks its PRs by assist
 * rate (click → PR view), breaks down contributors, shows per-PR Copilot vs
 * manual commit stacks and a commit hotspot scatter.
 */
export function RepoView({
  payloads,
  repository,
  onOpenPR,
  onOpenContributor
}) {
  const prs = useMemo(
    () => selectRepoPRs(payloads, repository),
    [payloads, repository]
  )
  const repoSummary = useMemo(
    () =>
      selectRepoSummaries(payloads).find((r) => r.repository === repository),
    [payloads, repository]
  )

  // Per-PR recomputed metrics (Rebase/merge commits excluded), keyed by PR
  // number so every chart and KPI reads the same trustworthy numbers.
  const prMetrics = useMemo(() => {
    const map = new Map()
    for (const p of prs) map.set(p.prNumber, computePrMetrics(p))
    return map
  }, [prs])

  // Average Copilot assist rate across this repo's PRs, and how many PRs
  // actually used Copilot at all.
  const prAverages = useMemo(() => {
    if (prs.length === 0) {
      return { avgAssistRate: 0, avgLineRate: 0, copilotPrCount: 0 }
    }
    let sumRate = 0
    let sumLineRate = 0
    let copilotPrCount = 0
    for (const p of prs) {
      const m = prMetrics.get(p.prNumber)
      sumRate += m.copilotAssistedRate
      sumLineRate += m.copilotAssistedLineRate
      if (m.copilotAssistedCommits > 0) copilotPrCount += 1
    }
    return {
      avgAssistRate: Math.round((sumRate / prs.length) * 100) / 100,
      avgLineRate: Math.round((sumLineRate / prs.length) * 100) / 100,
      copilotPrCount
    }
  }, [prs, prMetrics])

  const contributors = useMemo(() => {
    const map = new Map()
    for (const p of prs) {
      const m = prMetrics.get(p.prNumber)
      for (const [contributor, c] of m.byContributor) {
        if (c.totalCommits === 0) continue
        if (!map.has(contributor)) {
          map.set(contributor, { contributor, assisted: 0, total: 0 })
        }
        const e = map.get(contributor)
        e.assisted += c.copilotAssisted
        e.total += c.totalCommits
      }
    }
    return Array.from(map.values())
      .map((c) => ({
        ...c,
        rate: c.total ? Math.round((c.assisted / c.total) * 10000) / 100 : 0
      }))
      .sort((a, b) => b.rate - a.rate)
  }, [prs, prMetrics])

  const commitPoints = useMemo(
    () =>
      prs.flatMap((p) =>
        (Array.isArray(p.commitBreakdown) ? p.commitBreakdown : [])
          .filter(isPlottableCommit)
          .map((c) => ({ ...c, category: effectiveClassification(c) }))
          .filter((c) => c.category !== 'Rebase')
          .map((c) => ({
            x: c.linesAdded,
            y: c.linesDeleted,
            size: c.linesTouched,
            category: c.category,
            label: `#${p.prNumber} ${c.commit}`
          }))
      ),
    [prs]
  )

  const delivery = useMemo(
    () =>
      selectDeliveryMetrics(payloads).filter(
        (m) => m.repository === repository
      ),
    [payloads, repository]
  )

  if (!repoSummary) {
    return <Panel title="Repository" state="empty" />
  }

  return (
    <div className="flex flex-col gap-4">
      <SonarQualityPanel repository={repository} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Assist Rate"
          value={repoSummary.copilotAssistedRate}
          unit="%"
          accent="var(--color-copilot)"
          icon="✦"
          footnote={`${repoSummary.copilotAssistedCommits} of ${repoSummary.totalCommits} commits`}
          info="Share of this repository's commits authored with Copilot assistance (Rebase/merge commits excluded)."
        />
        <KpiCard
          label="Line Rate"
          value={repoSummary.copilotAssistedLineRate}
          unit="%"
          accent="var(--color-accent)"
          icon="≣"
          footnote={`${repoSummary.copilotAssistedLines.toLocaleString()} lines`}
          info="Share of lines touched by Copilot-assisted commits in this repository (Rebase/merge commits excluded)."
        />
        <KpiCard
          label="Pull Requests"
          value={repoSummary.prCount}
          accent="var(--color-info)"
          icon="⎇"
          footnote={`${repoSummary.totalCommits} commits`}
          info="Number of pull requests analysed for this repository in the selected time window."
        />
        <KpiCard
          label="Contributors"
          value={repoSummary.contributorCount}
          accent="var(--color-success)"
          icon="◐"
          footnote={shortRepoName(repository)}
          info="Distinct commit authors who contributed at least one non-Rebase commit to this repository."
        />
      </div>

      {/* Repo-level Copilot-assist detail: average rate + explicit counts */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Avg Assist Rate / PR"
          value={prAverages.avgAssistRate}
          unit="%"
          accent="var(--color-copilot)"
          icon="⌀"
          footnote={`Mean across ${repoSummary.prCount} pull requests`}
          info="Per-PR assist rate averaged evenly across all PRs (each PR weighted equally)."
        />
        <KpiCard
          label="Copilot PRs"
          value={prAverages.copilotPrCount}
          accent="var(--color-primary)"
          icon="⎇"
          footnote={`of ${repoSummary.prCount} PRs used Copilot`}
          info="Pull requests containing at least one Copilot-assisted commit."
        />
        <KpiCard
          label="Copilot Commits"
          value={repoSummary.copilotAssistedCommits}
          accent="var(--color-info)"
          icon="✦"
          footnote={`of ${repoSummary.totalCommits} total commits`}
          info="Total Copilot-assisted commits in this repository (Rebase excluded)."
        />
        <KpiCard
          label="Copilot Lines"
          value={repoSummary.copilotAssistedLines.toLocaleString()}
          accent="var(--color-accent)"
          icon="≣"
          footnote={`of ${repoSummary.totalLinesTouched.toLocaleString()} lines touched`}
          info="Total lines touched by Copilot-assisted commits in this repository (Rebase/merge commits excluded)."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Commit Composition">
          <DistributionDonut
            title="Commit Composition"
            data={[
              {
                name: 'Copilot-assisted',
                value: repoSummary.copilotAssistedCommits
              },
              {
                name: 'Human-authored',
                value: repoSummary.humanAuthoredCommits
              }
            ]}
          />
        </Panel>
        <Panel title="Line Composition">
          <DistributionDonut
            title="Line Composition"
            data={[
              {
                name: 'Copilot-assisted',
                value: repoSummary.copilotAssistedLines
              },
              { name: 'Human-authored', value: repoSummary.humanAuthoredLines }
            ]}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Assist Rate by Pull Request"
          subtitle="Click a PR to inspect its commits"
        >
          <CategoryBar
            title="Assist Rate by Pull Request"
            categories={prs.map((p) => `#${p.prNumber}`)}
            values={prs.map(
              (p) => prMetrics.get(p.prNumber).copilotAssistedRate
            )}
            seriesName="assist rate"
            unit="%"
            colorByValue
            onSelect={(i) => onOpenPR(repository, prs[i].prNumber)}
          />
        </Panel>
        <Panel
          title="Assist Rate by Contributor"
          subtitle="Within this repository — click to view across all repos"
        >
          <CategoryBar
            title="Assist Rate by Contributor"
            categories={contributors.map((c) => c.contributor)}
            values={contributors.map((c) => c.rate)}
            seriesName="assist rate"
            unit="%"
            colorByValue
            onSelect={(i) => onOpenContributor(contributors[i].contributor)}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Commits per PR: Copilot vs Human-authored"
          subtitle="Stacked commit counts · click a PR to drill in"
        >
          <StackedBar
            title="Commits per PR: Copilot vs Human-authored"
            categories={prs.map((p) => `#${p.prNumber}`)}
            onSelect={(i) => onOpenPR(repository, prs[i].prNumber)}
            series={[
              {
                name: 'Copilot-assisted',
                colorToken: 'copilot',
                data: prs.map(
                  (p) => prMetrics.get(p.prNumber).copilotAssistedCommits
                )
              },
              {
                name: 'Human-authored',
                colorToken: 'manual',
                data: prs.map(
                  (p) => prMetrics.get(p.prNumber).humanAuthoredCommits
                )
              }
            ]}
          />
        </Panel>
        <Panel
          title="Change Hotspots"
          subtitle="Commits by lines added vs deleted · size = total touched"
        >
          <HotspotScatter
            title="Change Hotspots"
            points={commitPoints}
            xName="Lines added"
            yName="Lines deleted"
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Delivery Time by Pull Request">
          <DeliveryTimeBar
            title="Delivery Time by Pull Request"
            items={delivery}
            onSelect={(i) => onOpenPR(repository, delivery[i].prNumber)}
          />
        </Panel>
        <Panel
          title="Batch Size by Pull Request"
          subtitle="Average lines touched per commit · smaller batches ship safer"
        >
          <CategoryBar
            title="Batch Size by Pull Request"
            categories={delivery.map((m) => `#${m.prNumber}`)}
            values={delivery.map((m) => m.avgCommitSize)}
            seriesName="avg lines/commit"
            unit=" lines"
            onSelect={(i) => onOpenPR(repository, delivery[i].prNumber)}
          />
        </Panel>
      </div>
    </div>
  )
}
