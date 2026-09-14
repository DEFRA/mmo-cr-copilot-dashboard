import { useMemo } from 'react'
import { Panel } from '../Panel'
import { KpiCard } from '../charts/KpiCard'
import { CategoryBar } from '../charts/CategoryBar'
import { CycleTimeScatter } from '../charts/CycleTimeScatter'
import {
  selectRepoPRs,
  selectDeliveryMetrics,
  computePrMetrics,
  formatDuration,
  shortRepoName
} from '../../lib/selectors'

const median = (nums) => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Dedicated per-repository cycle-time page. Plots every pull request against
 * its cycle time (scatter over merge date), with a ranked bar as a secondary
 * view. Hovering a point reveals all delivery metrics plus the contributors.
 */
export function RepoCycleTimeView({ payloads, repository, onOpenPR }) {
  const prs = useMemo(
    () => selectRepoPRs(payloads, repository),
    [payloads, repository]
  )
  const delivery = useMemo(
    () =>
      selectDeliveryMetrics(payloads).filter(
        (m) => m.repository === repository
      ),
    [payloads, repository]
  )

  // One scatter point per PR, joining delivery metrics with contributor names.
  // PRs without a usable timestamp are skipped rather than plotted at an
  // invalid position.
  const points = useMemo(() => {
    const byPr = new Map(delivery.map((m) => [m.prNumber, m]))
    return prs
      .map((pr) => {
        const m = byPr.get(pr.prNumber) ?? {}
        const prm = computePrMetrics(pr)
        const stamp = pr.prMergedAt ?? pr.lastCommitAt ?? pr.calculatedAt
        const mergedAt = new Date(stamp).getTime()
        if (!Number.isFinite(mergedAt)) return null
        const contributors = Array.from(prm.byContributor.entries())
          .filter(([, c]) => c.totalCommits > 0)
          .map(([author]) => author)
        return {
          prNumber: pr.prNumber,
          mergedAt,
          cycleHours: m.cycleHours ?? 0,
          timeToMergeHours: m.timeToMergeHours ?? 0,
          batchSize: m.avgCommitSize ?? 0,
          assistRate: prm.copilotAssistedRate,
          linesAdded: m.linesAdded ?? 0,
          linesDeleted: m.linesDeleted ?? 0,
          contributors
        }
      })
      .filter(Boolean)
  }, [prs, delivery])

  const stats = useMemo(() => {
    const cycles = points.map((p) => p.cycleHours).filter((h) => h > 0)
    return {
      avg: cycles.length
        ? cycles.reduce((a, b) => a + b, 0) / cycles.length
        : 0,
      med: median(cycles),
      fastest: cycles.length ? Math.min(...cycles) : 0,
      slowest: cycles.length ? Math.max(...cycles) : 0,
      prCount: points.length
    }
  }, [points])

  // Bar view ordered by cycle time (slowest first) for quick ranking.
  const ranked = useMemo(
    () => [...points].sort((a, b) => b.cycleHours - a.cycleHours),
    [points]
  )

  if (prs.length === 0) {
    return (
      <Panel
        title="Cycle time"
        state="empty"
        subtitle="No pull requests in the selected window."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Avg Cycle Time"
          value={formatDuration(stats.avg)}
          accent="var(--color-primary)"
          icon="⏱"
          footnote={`Across ${stats.prCount} pull requests`}
          info="Average hours between a PR's first and last commit for this repository."
        />
        <KpiCard
          label="Median Cycle Time"
          value={formatDuration(stats.med)}
          accent="var(--color-info)"
          icon="≈"
          footnote="Typical PR duration"
          info="The middle cycle time — half of PRs finished faster, half slower. Less skewed by a few very long PRs than the average."
        />
        <KpiCard
          label="Fastest"
          value={formatDuration(stats.fastest)}
          accent="var(--color-success)"
          icon="⚡"
          footnote="Shortest cycle time"
          info="The single shortest first-commit-to-last-commit duration among this repository's PRs."
        />
        <KpiCard
          label="Slowest"
          value={formatDuration(stats.slowest)}
          accent="var(--color-danger)"
          icon="🐢"
          footnote="Longest cycle time"
          info="The single longest first-commit-to-last-commit duration among this repository's PRs."
        />
      </div>

      <Panel
        title={`Cycle time by pull request — ${shortRepoName(repository)}`}
        subtitle="Each bubble is a PR · x = merge date · y = cycle time · size = batch · colour = assist rate · click to open the PR"
      >
        <CycleTimeScatter
          title={`Cycle time by pull request for ${shortRepoName(repository)}`}
          points={points}
          onSelect={(prNumber) => onOpenPR(repository, prNumber)}
        />
      </Panel>

      <Panel
        title="Cycle time ranking"
        subtitle="Pull requests ordered slowest → fastest · click a bar to open the PR"
      >
        <CategoryBar
          title="Cycle time by pull request"
          categories={ranked.map((p) => `#${p.prNumber}`)}
          values={ranked.map((p) => p.cycleHours)}
          seriesName="cycle time"
          unit=" h"
          onSelect={(i) => onOpenPR(repository, ranked[i].prNumber)}
        />
      </Panel>
    </div>
  )
}
