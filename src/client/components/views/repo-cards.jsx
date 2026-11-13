import { MiniBars, ProgressRing } from '../dashboard'
import { formatDuration } from '../../lib/selectors'
import { leverageV2Figures } from './overview-cards.jsx'
import { lines, plural, pullRequests } from './scope.jsx'

function leverageV1Figures(leverage) {
  const base = `Coverage ${leverage.coverage}% · adoption ${leverage.adoption}%`
  const speed = leverage.flowAvailable
    ? `${leverage.flowRatio}× faster than baseline`
    : 'no speed baseline yet'
  return {
    value: String(leverage.leveragePct),
    unit: '%',
    sub: `${base} · ${speed}`
  }
}

function adoptionCard({ delivery, byPr }) {
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
      title: 'Copilot adoption by pull request',
      items: byPr((r) => ({
        value: `${r.adopters} of ${plural(r.contributors.length, 'contributor')}`,
        sub: r.contributors.join(', ')
      }))
    }
  }
}

function assistCard({ summary, averages, byPr }) {
  return {
    id: 'assist',
    label: 'Commit assist rate',
    anchor: 'metric-copilot-assist-rate',
    family: 'assist',
    icon: 'sparkle',
    value: String(summary.copilotAssistedRate),
    unit: '%',
    sub: `${summary.copilotAssistedCommits} of ${summary.totalCommits} commits · Copilot used in ${averages.copilotPrCount} of ${pullRequests(summary.prCount)} · average ${averages.avgAssistRate}% per pull request`,
    chart: <ProgressRing value={summary.copilotAssistedRate} />,
    drill: {
      title: 'Commit assist rate by pull request',
      items: byPr((r) => ({
        value: `${r.copilotAssistedRate}%`,
        sub: `${r.copilotAssistedCommits} of ${plural(r.totalCommits, 'commit')}`,
        pct: r.copilotAssistedRate
      }))
    }
  }
}

function lineRateCard({ summary, byPr }) {
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
      title: 'Line assist rate by pull request',
      items: byPr((r) => ({
        value: `${r.copilotAssistedLineRate}%`,
        sub: `${lines(r.copilotAssistedLines)} Copilot and ${lines(r.humanAuthoredLines)} human-authored of ${lines(r.totalLinesTouched)} lines`,
        pct: r.copilotAssistedLineRate
      }))
    }
  }
}

function leverageCard({ v2, leverage, delivery, onOpenLeverage, byPr }) {
  return {
    id: 'leverage',
    label: 'Copilot Leverage',
    anchor: 'metric-copilot-leverage',
    family: 'leverage',
    icon: 'rocket',
    ...(v2 ? leverageV2Figures(v2) : leverageV1Figures(leverage)),
    chart: v2 ? undefined : <ProgressRing value={leverage.leveragePct} />,
    drill: {
      title: 'Copilot Leverage inputs by pull request',
      ...(onOpenLeverage && {
        more: { text: 'How this is calculated', onOpen: onOpenLeverage }
      }),
      intro: `Copilot Leverage is scored per repository. Each pull request is Copilot-led at a commit assist rate of 50% or more. Read with PR rework ratio: ${delivery.reworkRatio}.`,
      items: byPr((r) => ({
        value: r.copilotLed ? 'Copilot-led' : 'Human-led',
        sub: `Line assist ${r.copilotAssistedLineRate}% · PR coding cycle time ${formatDuration(r.cycleHours)}`
      }))
    }
  }
}

function cycleTimeCard({ delivery, prs, byPr }) {
  return {
    id: 'cycletime',
    label: 'PR coding cycle time',
    anchor: 'metric-pr-coding-cycle-time',
    family: 'speed',
    icon: 'clock',
    value: formatDuration(delivery.avgCycleHours),
    sub: `Average · median ${formatDuration(delivery.medianCycleHours)} · fastest ${formatDuration(delivery.fastestCycleHours)}`,
    chart: <MiniBars data={prs.map((r) => r.cycleHours)} />,
    drill: {
      title: 'PR coding cycle time by pull request',
      items: byPr((r) => ({
        value: formatDuration(r.cycleHours),
        sub: r.merged ? 'Merged' : 'Open'
      }))
    }
  }
}

function reworkCard({ delivery, prs, byPr }) {
  return {
    id: 'rework',
    label: 'PR rework ratio',
    anchor: 'metric-pr-rework-ratio',
    family: 'risk',
    icon: 'rework',
    value: String(delivery.reworkRatio),
    sub: `${lines(delivery.linesDeleted)} deleted per ${lines(delivery.linesAdded)} added`,
    chart: <MiniBars data={prs.map((r) => r.reworkRatio)} />,
    drill: {
      title: 'PR rework ratio by pull request',
      items: byPr((r) => ({
        value: String(r.reworkRatio),
        sub: `${lines(r.linesDeleted)} deleted per ${lines(r.linesAdded)} added`
      }))
    }
  }
}

function batchCard({ delivery, prs, byPr }) {
  return {
    id: 'batch',
    label: 'Average batch size',
    anchor: 'metric-avg-batch-size',
    family: 'speed',
    icon: 'box',
    value: String(delivery.avgCommitSize),
    unit: 'lines',
    sub: 'Lines touched per commit',
    chart: <MiniBars data={prs.map((r) => r.avgCommitSize)} />,
    drill: {
      title: 'Average batch size by pull request',
      items: byPr((r) => ({
        value: `${r.avgCommitSize} lines`,
        sub: `${lines(r.totalLinesTouched)} lines over ${plural(r.totalCommits, 'commit')}`
      }))
    }
  }
}

function netLinesCard({ delivery, prs, byPr }) {
  return {
    id: 'netlines',
    label: 'Net lines delivered',
    anchor: 'metric-net-lines-delivered',
    family: 'output',
    icon: 'plusminus',
    value: lines(delivery.netLines),
    compact: true,
    sub: `${lines(delivery.linesAdded)} added minus ${lines(delivery.linesDeleted)} deleted`,
    chart: <MiniBars data={prs.map((r) => r.netLines)} />,
    drill: {
      title: 'Net lines delivered by pull request',
      items: byPr((r) => ({
        value: lines(r.netLines),
        sub: `${lines(r.linesAdded)} added minus ${lines(r.linesDeleted)} deleted`
      }))
    }
  }
}

/** The repository overview's KPI cards, each with its by-pull-request drill. */
export const repoCards = (ctx) => [
  adoptionCard(ctx),
  assistCard(ctx),
  lineRateCard(ctx),
  leverageCard(ctx),
  cycleTimeCard(ctx),
  reworkCard(ctx),
  batchCard(ctx),
  netLinesCard(ctx)
]
