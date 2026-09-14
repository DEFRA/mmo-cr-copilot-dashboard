import { useMemo } from 'react'
import { Panel } from '../Panel'
import { KpiCard } from '../charts/KpiCard'
import { DistributionDonut } from '../charts/DistributionDonut'
import { StackedBar } from '../charts/StackedBar'
import { HotspotScatter } from '../charts/HotspotScatter'
import { CategoryBar } from '../charts/CategoryBar'
import { SonarQualityPanel } from '../charts/SonarQuality'
import {
  shortRepoName,
  isPlottableCommit,
  computePrMetrics,
  effectiveClassification
} from '../../lib/selectors'

/**
 * Level 3 — Single pull request. Per-commit Copilot vs manual line stacks, a
 * commit hotspot scatter, contributor split, and composition donuts. Commits
 * are the leaf level of the drill-down.
 */
export function PRView({ payloads, repository, prNumber, onOpenContributor }) {
  const pr = useMemo(
    () =>
      payloads.find(
        (p) => p.repository === repository && p.prNumber === prNumber
      ),
    [payloads, repository, prNumber]
  )

  const commits = pr?.commitBreakdown ?? []
  // Recompute this PR's metrics from its commits (Rebase/merge commits
  // excluded) rather than trusting the upstream summary.
  const m = useMemo(() => (pr ? computePrMetrics(pr) : null), [pr])
  // Only non-Rebase commits with the fields the charts need are plotted;
  // incomplete/merge commits are skipped in the charts (all still appear in
  // the commit log table below).
  const plottableCommits = useMemo(
    () =>
      commits
        .filter(isPlottableCommit)
        .map((c) => ({ ...c, effectiveClass: effectiveClassification(c) }))
        .filter((c) => c.effectiveClass !== 'Rebase'),
    [commits]
  )

  const perCommit = useMemo(() => {
    return plottableCommits.map((c) => ({
      label: c.commit,
      copilot: c.effectiveClass === 'Copilot-assisted' ? c.linesTouched : 0,
      manual: c.effectiveClass === 'Human-authored' ? c.linesTouched : 0,
      subject: c.subject
    }))
  }, [plottableCommits])

  const commitPoints = useMemo(
    () =>
      plottableCommits.map((c) => ({
        x: c.linesAdded,
        y: c.linesDeleted,
        size: c.linesTouched,
        category: c.effectiveClass,
        label: c.commit
      })),
    [plottableCommits]
  )

  if (!pr || !m) {
    return <Panel title="Pull Request" state="empty" />
  }

  const contributorRows = Array.from(m.byContributor.values()).filter(
    (c) => c.totalCommits > 0
  )

  return (
    <div className="flex flex-col gap-4">
      <SonarQualityPanel repository={repository} prNumber={prNumber} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Assist Rate"
          value={m.copilotAssistedRate}
          unit="%"
          accent="var(--color-copilot)"
          icon="✦"
          footnote={`${m.copilotAssistedCommits} of ${m.totalCommits} commits`}
          info="Share of this PR's commits authored with Copilot assistance (Rebase/merge commits excluded)."
        />
        <KpiCard
          label="Line Rate"
          value={m.copilotAssistedLineRate}
          unit="%"
          accent="var(--color-accent)"
          icon="≣"
          footnote={`${m.copilotAssistedLines} of ${m.totalLinesTouched} lines`}
          info="Share of lines touched by Copilot-assisted commits in this PR (Rebase/merge commits excluded)."
        />
        <KpiCard
          label="Lines Touched"
          value={m.totalLinesTouched.toLocaleString()}
          accent="var(--color-info)"
          icon="±"
          footnote={
            pr.sourceBranch
              ? `${pr.sourceBranch} → ${pr.targetBranch}`
              : `→ ${pr.targetBranch}`
          }
          info="Total lines added + deleted across this PR's non-Rebase commits."
        />
        <KpiCard
          label="Commits"
          value={m.totalCommits}
          accent="var(--color-success)"
          icon="◍"
          footnote={
            m.rebaseCommits
              ? `Build ${pr.buildId} · ${m.rebaseCommits} rebase excluded`
              : `Build ${pr.buildId}`
          }
          info="Number of commits counted toward this PR's metrics. Rebase/merge commits are excluded and shown separately."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Commit Composition">
          <DistributionDonut
            title="Commit Composition"
            data={[
              { name: 'Copilot-assisted', value: m.copilotAssistedCommits },
              { name: 'Human-authored', value: m.humanAuthoredCommits }
            ]}
          />
        </Panel>
        <Panel title="Line Composition">
          <DistributionDonut
            title="Line Composition"
            data={[
              { name: 'Copilot-assisted', value: m.copilotAssistedLines },
              { name: 'Human-authored', value: m.humanAuthoredLines }
            ]}
          />
        </Panel>
      </div>

      <Panel
        title="Lines per Commit: Copilot vs Human-authored"
        subtitle="Each bar is a commit — stacked by classification"
      >
        <StackedBar
          title="Lines per Commit: Copilot vs Human-authored"
          height={360}
          categories={perCommit.map((c) => c.label)}
          series={[
            {
              name: 'Copilot-assisted',
              colorToken: 'copilot',
              data: perCommit.map((c) => c.copilot)
            },
            {
              name: 'Human-authored',
              colorToken: 'manual',
              data: perCommit.map((c) => c.manual)
            }
          ]}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
        <Panel
          title="Assist Rate by Contributor"
          subtitle="On this PR — click to view across all repos"
        >
          <CategoryBar
            title="Assist Rate by Contributor"
            categories={contributorRows.map((c) => c.contributor)}
            values={contributorRows.map((c) =>
              c.totalCommits
                ? Math.round((c.copilotAssisted / c.totalCommits) * 10000) / 100
                : 0
            )}
            seriesName="assist rate"
            unit="%"
            colorByValue
            onSelect={(i) => onOpenContributor(contributorRows[i].contributor)}
          />
        </Panel>
      </div>

      <Panel
        title="Commit Log"
        subtitle={`${shortRepoName(repository)} · PR #${prNumber}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th scope="col" className="px-3 py-2 font-medium">
                  Commit
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Author
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Subject
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Class
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  +Added
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  −Deleted
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {commits.map((c) => {
                const kind = effectiveClassification(c)
                const isCopilot = kind === 'Copilot-assisted'
                const isRebase = kind === 'Rebase'
                const pillColor = isRebase
                  ? 'var(--color-text-muted)'
                  : isCopilot
                    ? 'var(--color-copilot)'
                    : 'var(--color-manual)'
                return (
                  <tr
                    key={c.commit}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                      {c.commit}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)]">
                      {c.author ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)]">
                      {c.subject}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="pill"
                        style={{ color: pillColor, borderColor: pillColor }}
                      >
                        <span aria-hidden="true">
                          {isRebase ? '⮑' : isCopilot ? '✦' : '✎'}
                        </span>
                        {isRebase
                          ? 'Rebase'
                          : isCopilot
                            ? 'Copilot'
                            : 'Human-authored'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--color-success)]">
                      +{c.linesAdded}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--color-danger)]">
                      −{c.linesDeleted}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text)]">
                      {c.netLines}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
