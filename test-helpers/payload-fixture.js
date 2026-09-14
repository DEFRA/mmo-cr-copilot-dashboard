/**
 * Builds a valid analytics payload. Pass overrides to exercise edge cases
 * without restating the whole (large) shape in every test.
 */
export function buildPayload(overrides = {}) {
  return {
    prNumber: 42,
    repository: 'DEFRA/mmo-cr-copilot-dashboard',
    sourceBranch: 'feature/charts',
    targetBranch: 'main',
    buildId: 'build-1001',
    calculatedAt: '2026-01-15T10:00:00.000Z',
    prCreatedAt: '2026-01-12T09:00:00.000Z',
    firstCommitAt: '2026-01-12T09:30:00.000Z',
    lastCommitAt: '2026-01-15T09:45:00.000Z',
    prMergedAt: '2026-01-15T10:15:00.000Z',
    summary: {
      totalCommits: 4,
      copilotAssistedCommits: 3,
      humanAuthoredCommits: 1,
      copilotAssistedRate: 75,
      totalLinesTouched: 400,
      copilotAssistedLines: 300,
      humanAuthoredLines: 100,
      copilotAssistedLineRate: 75
    },
    contributorBreakdown: [
      {
        contributor: 'ada',
        totalCommits: 4,
        copilotAssisted: 3,
        humanAuthored: 1,
        linesAdded: 320,
        linesDeleted: 80,
        linesTouched: 400,
        netLines: 240,
        copilotAssistedLines: 300,
        humanAuthoredLines: 100
      }
    ],
    commitBreakdown: [
      {
        commit: 'abc1234',
        committedAt: '2026-01-15T09:45:00.000Z',
        author: 'ada',
        subject: 'Add cycle time scatter',
        classification: 'Copilot-assisted',
        filesChanged: 3,
        linesAdded: 220,
        linesDeleted: 20,
        linesTouched: 240,
        netLines: 200
      }
    ],
    ...overrides
  }
}

/** Builds one commit entry for a payload's `commitBreakdown`. */
export function buildCommit(overrides = {}) {
  const linesAdded = overrides.linesAdded ?? 100
  const linesDeleted = overrides.linesDeleted ?? 20

  return {
    commit: 'abc1234',
    committedAt: '2026-01-15T09:45:00.000Z',
    author: 'ada',
    subject: 'Add cycle time scatter',
    classification: 'Copilot-assisted',
    filesChanged: 2,
    linesTouched: linesAdded + linesDeleted,
    netLines: linesAdded - linesDeleted,
    ...overrides,
    linesAdded,
    linesDeleted
  }
}

/**
 * Builds a payload whose summary and contributor breakdown are derived from the
 * supplied commits, so selector maths has a self-consistent input.
 */
export function buildPayloadFromCommits(commits, overrides = {}) {
  const byContributor = new Map()

  for (const commit of commits) {
    if (!byContributor.has(commit.author)) {
      byContributor.set(commit.author, {
        contributor: commit.author,
        totalCommits: 0,
        copilotAssisted: 0,
        humanAuthored: 0,
        linesAdded: 0,
        linesDeleted: 0,
        linesTouched: 0,
        netLines: 0,
        copilotAssistedLines: 0,
        humanAuthoredLines: 0
      })
    }

    const entry = byContributor.get(commit.author)
    const assisted = commit.classification === 'Copilot-assisted'

    entry.totalCommits += 1
    entry[assisted ? 'copilotAssisted' : 'humanAuthored'] += 1
    entry.linesAdded += commit.linesAdded
    entry.linesDeleted += commit.linesDeleted
    entry.linesTouched += commit.linesTouched
    entry.netLines += commit.netLines
    entry[assisted ? 'copilotAssistedLines' : 'humanAuthoredLines'] +=
      commit.linesTouched
  }

  const contributorBreakdown = [...byContributor.values()]
  const sum = (key) =>
    contributorBreakdown.reduce((total, entry) => total + entry[key], 0)

  const totalCommits = sum('totalCommits')
  const totalLinesTouched = sum('linesTouched')
  const copilotAssistedCommits = sum('copilotAssisted')
  const copilotAssistedLines = sum('copilotAssistedLines')
  const percent = (part, whole) => (whole ? (part / whole) * 100 : 0)

  return buildPayload({
    commitBreakdown: commits,
    contributorBreakdown,
    summary: {
      totalCommits,
      copilotAssistedCommits,
      humanAuthoredCommits: sum('humanAuthored'),
      copilotAssistedRate: percent(copilotAssistedCommits, totalCommits),
      totalLinesTouched,
      copilotAssistedLines,
      humanAuthoredLines: sum('humanAuthoredLines'),
      copilotAssistedLineRate: percent(copilotAssistedLines, totalLinesTouched)
    },
    ...overrides
  })
}
