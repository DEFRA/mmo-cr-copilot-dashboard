import { useMemo } from 'react'
import { Panel } from '../Panel'
import { KpiCard } from '../charts/KpiCard'
import { DistributionDonut } from '../charts/DistributionDonut'
import { StackedBar } from '../charts/StackedBar'
import { CategoryBar } from '../charts/CategoryBar'
import { HotspotScatter } from '../charts/HotspotScatter'
import {
  selectContributorPRs,
  selectContributorSummaries
} from '../../lib/selectors'

/**
 * Cross-cutting — one contributor across every repository. Their overall
 * adoption, PR-by-PR assist rate (click → PR), Copilot vs manual commit stacks,
 * per-commit hotspots, and line composition.
 */
export function ContributorView({ payloads, contributor, onOpenPR }) {
  const summary = useMemo(
    () =>
      selectContributorSummaries(payloads).find(
        (c) => c.contributor === contributor
      ),
    [payloads, contributor]
  )
  const prs = useMemo(
    () => selectContributorPRs(payloads, contributor),
    [payloads, contributor]
  )

  const commitPoints = useMemo(
    () =>
      prs.flatMap((p) =>
        p.commits.map((c) => ({
          x: c.linesAdded,
          y: c.linesDeleted,
          size: c.linesTouched,
          category: c.classification,
          label: `${p.repoName} #${p.prNumber} ${c.commit}`
        }))
      ),
    [prs]
  )

  if (!summary) {
    return <Panel title="Contributor" state="empty" />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Assist Rate"
          value={summary.copilotAssistedRate}
          unit="%"
          accent="var(--color-copilot)"
          icon="✦"
          footnote={`${summary.copilotAssisted} of ${summary.totalCommits} commits`}
          info="Share of this contributor's commits that are Copilot-assisted, across all repos (Rebase excluded)."
        />
        <KpiCard
          label="Line Rate"
          value={summary.copilotAssistedLineRate}
          unit="%"
          accent="var(--color-accent)"
          icon="≣"
          footnote={`${summary.copilotAssistedLines.toLocaleString()} lines`}
          info="Share of lines this contributor touched via Copilot-assisted commits (Rebase/merge commits excluded)."
        />
        <KpiCard
          label="Repositories"
          value={summary.repoCount}
          accent="var(--color-info)"
          icon="⌗"
          footnote={`${summary.prCount} pull requests`}
          info="Distinct repositories this contributor made at least one non-Rebase commit to."
        />
        <KpiCard
          label="Net Lines"
          value={summary.netLines.toLocaleString()}
          accent="var(--color-success)"
          icon="±"
          footnote={`+${summary.linesAdded.toLocaleString()} added − ${summary.linesDeleted.toLocaleString()} deleted`}
          info="Lines added minus lines deleted across this contributor's non-Rebase commits — the net code they actually delivered after rework."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Commit Composition">
          <DistributionDonut
            title="Commit Composition"
            data={[
              { name: 'Copilot-assisted', value: summary.copilotAssisted },
              { name: 'Human-authored', value: summary.humanAuthored }
            ]}
          />
        </Panel>
        <Panel title="Line Composition">
          <DistributionDonut
            title="Line Composition"
            data={[
              { name: 'Copilot-assisted', value: summary.copilotAssistedLines },
              { name: 'Human-authored', value: summary.humanAuthoredLines }
            ]}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Assist Rate by Pull Request"
          subtitle="Every PR this contributor touched · click to open"
        >
          <CategoryBar
            title="Assist Rate by Pull Request"
            categories={prs.map((p) => `${p.repoName} #${p.prNumber}`)}
            values={prs.map((p) => p.copilotAssistedRate)}
            seriesName="assist rate"
            unit="%"
            colorByValue
            onSelect={(i) => onOpenPR(prs[i].repository, prs[i].prNumber)}
          />
        </Panel>
        <Panel
          title="Commits per PR: Copilot vs Human-authored"
          subtitle="Click a PR to drill in"
        >
          <StackedBar
            title="Commits per PR: Copilot vs Human-authored"
            categories={prs.map((p) => `${p.repoName} #${p.prNumber}`)}
            onSelect={(i) => onOpenPR(prs[i].repository, prs[i].prNumber)}
            series={[
              {
                name: 'Copilot-assisted',
                colorToken: 'copilot',
                data: prs.map((p) => p.copilotAssisted)
              },
              {
                name: 'Human-authored',
                colorToken: 'manual',
                data: prs.map((p) => p.humanAuthored)
              }
            ]}
          />
        </Panel>
      </div>

      <Panel
        title="Change Hotspots"
        subtitle="Every commit by lines added vs deleted · size = total touched"
      >
        <HotspotScatter
          title="Change Hotspots"
          height={360}
          points={commitPoints}
          xName="Lines added"
          yName="Lines deleted"
        />
      </Panel>
    </div>
  )
}
