import { MiniBars, ProgressRing } from '../dashboard'
import { formatDuration } from '../../lib/selectors'
import { lines, plural, pullRequests } from './scope.jsx'

const LEVERAGE_TITLE = 'Copilot Leverage by repository'
// Cards an AI-native project hides: it has no pre-Copilot adoption to measure.
const AI_NATIVE_HIDDEN = new Set([
  'adoption',
  'commit-assist',
  'line-assist',
  'assist',
  'linerate'
])

const repoItem = (r, openRepo, fields) => ({
  key: r.repository,
  name: r.name,
  onOpen: openRepo(r.repository),
  ...fields
})

function adoptionCard({ delivery, repos, openRepo }) {
  return {
    id: 'adoption',
    label: 'Copilot adoption',
    anchor: 'metric-copilot-adoption',
    family: 'adoption',
    icon: 'users',
    value: String(delivery.adoptionPct),
    unit: '%',
    sub: `${delivery.adopters} of ${delivery.contributorTotal} contributors`,
    chart: <ProgressRing value={delivery.adoptionPct} />,
    drill: {
      title: 'Copilot adoption by repository',
      items: repos.map((r) =>
        repoItem(r, openRepo, {
          value: plural(r.contributorCount, 'contributor'),
          sub: `${r.copilotAssistedCommits} of ${r.totalCommits} commits Copilot-assisted · ${pullRequests(r.prCount)}`
        })
      )
    }
  }
}

function assistCard({ summary, repos, openRepo }) {
  return {
    id: 'assist',
    label: 'Commit assist rate',
    anchor: 'metric-copilot-assist-rate',
    family: 'assist',
    icon: 'sparkle',
    value: String(summary.copilotAssistedRate),
    unit: '%',
    sub: `${summary.copilotAssistedCommits} of ${summary.totalCommits} commits`,
    chart: <ProgressRing value={summary.copilotAssistedRate} />,
    drill: {
      title: 'Commit assist rate by repository',
      items: repos.map((r) =>
        repoItem(r, openRepo, {
          value: `${r.copilotAssistedRate}%`,
          sub: `${r.copilotAssistedCommits} of ${r.totalCommits} commits · line assist ${r.copilotAssistedLineRate}% · ${pullRequests(r.prCount)}`,
          pct: r.copilotAssistedRate
        })
      )
    }
  }
}

function lineRateCard({ summary, repos, openRepo }) {
  return {
    id: 'linerate',
    label: 'Line assist rate',
    anchor: 'metric-copilot-line-rate',
    family: 'assist',
    icon: 'code',
    value: String(summary.copilotAssistedLineRate),
    unit: '%',
    sub: `${lines(summary.copilotAssistedLines)} of ${lines(summary.totalLinesTouched)} lines`,
    chart: <ProgressRing value={summary.copilotAssistedLineRate} />,
    drill: {
      title: 'Line assist rate by repository',
      items: repos.map((r) =>
        repoItem(r, openRepo, {
          value: `${r.copilotAssistedLineRate}%`,
          sub: `${lines(r.copilotAssistedLines)} Copilot and ${lines(r.humanAuthoredLines)} human-authored of ${lines(r.totalLinesTouched)} lines`,
          pct: r.copilotAssistedLineRate
        })
      )
    }
  }
}

export function leverageV2Figures(data) {
  if (!data.enoughData) {
    return { value: '–', sub: 'Not enough comparable pull requests yet' }
  }
  const bands = data.comparableBands === 1 ? 'band' : 'bands'
  return {
    value: String(data.overallLeverageScore),
    unit: '×',
    sub: `${data.comparableBands} comparable ${bands} · ${data.sampleSize.adopted} adopted PRs`
  }
}

function leverageV1Figures(delivery) {
  const base = `Coverage ${delivery.leverageCoverage}% · adoption ${delivery.leverageAdoption}%`
  const speed = delivery.leverageFlowAvailable
    ? `${delivery.leverageFlowRatio}× faster than baseline`
    : 'no speed baseline yet'
  return {
    value: String(delivery.copilotLeverage),
    unit: '%',
    sub: `${base} · ${speed}`
  }
}

const baselineText = (r) =>
  r.baselineLocal
    ? `this repository, ${r.baselineCount} historical PRs`
    : `portfolio-wide, ${r.baselineCount} PRs`

function flowText(r) {
  if (!r.flowAvailable) {
    return 'No speed baseline yet'
  }
  const now = formatDuration(r.copilotMedianCycleHours)
  const before = formatDuration(r.baselineMedianCycleHours)
  return `${r.flowRatio}× faster: median ${now} now against ${before} baseline (${baselineText(r)})`
}

function leverageV2Drill({ leverageData, delivery, onOpenLeverage }, more) {
  return {
    title: LEVERAGE_TITLE,
    ...more,
    intro: `Compares median PR coding cycle times within each complexity band against the pre-adoption baseline, standardised on the current period’s mix. Read with PR rework ratio: ${delivery.reworkRatio}.`,
    items: Object.entries(leverageData.bandComparison ?? {}).map(
      ([band, b]) => ({
        key: band,
        name: `Band ${band}`,
        value: b.comparable ? `${b.speedup}×` : 'Not comparable',
        sub: `${b.baselineCount} baseline PRs vs ${b.adoptedCount} adopted · median ${b.baselineMedianCycleHours}h vs ${b.adoptedMedianCycleHours}h`,
        onOpen: onOpenLeverage
      })
    )
  }
}

function leverageV1Drill({ leverage, delivery, openRepo }, more) {
  return {
    title: LEVERAGE_TITLE,
    ...more,
    intro: `Geometric mean of coverage, efficiency (current Copilot speed against a historical manually-led baseline) and adoption, 0 to 100. Read with PR rework ratio: ${delivery.reworkRatio}.`,
    items: leverage.repos.map((r) =>
      repoItem(r, openRepo, {
        value: `${r.leveragePct}%`,
        sub: [
          `Coverage ${r.coverage}% · efficiency ${r.efficiency}% · adoption ${r.adoption}%`,
          flowText(r)
        ].join(' · '),
        pct: r.leveragePct
      })
    )
  }
}

function leverageCard(ctx) {
  const { leverageData, delivery, onOpenLeverage } = ctx
  const v2 = Boolean(leverageData)
  const more = onOpenLeverage && {
    more: { text: 'How this is calculated', onOpen: onOpenLeverage }
  }
  return {
    id: 'leverage',
    label: 'Copilot Leverage',
    anchor: 'metric-copilot-leverage',
    family: 'leverage',
    icon: 'rocket',
    ...(v2 ? leverageV2Figures(leverageData) : leverageV1Figures(delivery)),
    chart: v2 ? undefined : <ProgressRing value={delivery.copilotLeverage} />,
    drill: v2 ? leverageV2Drill(ctx, more) : leverageV1Drill(ctx, more)
  }
}

function cycleTimeCard({ delivery, repoCycle, onOpenRepoCycle }) {
  return {
    id: 'cycletime',
    label: 'PR coding cycle time',
    anchor: 'metric-pr-coding-cycle-time',
    family: 'speed',
    icon: 'clock',
    value: formatDuration(delivery.avgCycleHours),
    sub: `Average · median ${formatDuration(delivery.medianCycleHours)} · fastest ${formatDuration(delivery.fastestCycleHours)}`,
    chart: <MiniBars data={repoCycle.map((r) => r.avgCycleHours)} />,
    drill: {
      title: 'PR coding cycle time by repository',
      hint: ': pull request cycle times',
      items: repoCycle.map((r) => ({
        key: r.repository,
        name: r.name,
        value: formatDuration(r.avgCycleHours),
        sub: `Fastest ${formatDuration(r.fastest)} · slowest ${formatDuration(r.slowest)} · ${pullRequests(r.prCount)}`,
        onOpen: () => onOpenRepoCycle(r.repository)
      }))
    }
  }
}

function reworkCard({ delivery, rework, openRepo }) {
  return {
    id: 'rework',
    label: 'PR rework ratio',
    anchor: 'metric-pr-rework-ratio',
    family: 'risk',
    icon: 'rework',
    value: String(delivery.reworkRatio),
    sub: `${lines(delivery.linesDeleted)} deleted per ${lines(delivery.linesAdded)} added`,
    chart: <MiniBars data={rework.repos.map((r) => r.reworkRatio)} />,
    drill: {
      title: 'PR rework ratio by repository',
      intro:
        'Lines deleted per line added, per repository, excluding rebase and merge commits. The project ratio weights these by lines added.',
      items: rework.repos.map((r) =>
        repoItem(r, openRepo, {
          value: String(r.reworkRatio),
          sub: `${lines(r.linesDeleted)} deleted per ${lines(r.linesAdded)} added · ${pullRequests(r.prCount)}`
        })
      )
    }
  }
}

function batchCard({ delivery, repos, openRepo }) {
  return {
    id: 'batch',
    label: 'Average batch size',
    anchor: 'metric-avg-batch-size',
    family: 'speed',
    icon: 'box',
    value: String(delivery.avgCommitSize),
    unit: 'lines',
    sub: 'Lines touched per commit',
    chart: <MiniBars data={repos.map((r) => r.avgCommitSize)} />,
    drill: {
      title: 'Average batch size by repository',
      items: repos.map((r) =>
        repoItem(r, openRepo, {
          value: `${r.avgCommitSize} lines`,
          sub: `${lines(r.totalLinesTouched)} lines over ${plural(r.totalCommits, 'commit')}`
        })
      )
    }
  }
}

function netLinesCard({ delivery, rework, openRepo }) {
  return {
    id: 'netlines',
    label: 'Net lines delivered',
    anchor: 'metric-net-lines-delivered',
    family: 'output',
    icon: 'plusminus',
    value: lines(delivery.netLines),
    compact: true,
    sub: `${lines(delivery.linesAdded)} added minus ${lines(delivery.linesDeleted)} deleted`,
    chart: <MiniBars data={rework.repos.map((r) => r.netLines)} />,
    drill: {
      title: 'Net lines delivered by repository',
      items: rework.repos.map((r) =>
        repoItem(r, openRepo, {
          value: lines(r.netLines),
          sub: `${lines(r.linesAdded)} added minus ${lines(r.linesDeleted)} deleted`
        })
      )
    }
  }
}

/** The project overview's KPI cards, each with its by-repository drill. */
export function overviewCards(ctx, projectType) {
  const cards = [
    adoptionCard(ctx),
    assistCard(ctx),
    lineRateCard(ctx),
    leverageCard(ctx),
    cycleTimeCard(ctx),
    reworkCard(ctx),
    batchCard(ctx),
    netLinesCard(ctx)
  ]
  return projectType === 'ai-native'
    ? cards.filter((c) => !AI_NATIVE_HIDDEN.has(c.id))
    : cards
}
