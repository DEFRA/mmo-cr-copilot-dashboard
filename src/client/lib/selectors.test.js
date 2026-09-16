import { buildPayload } from '#/test-helpers/payload-fixture.js'
import {
  shortRepoName,
  classificationLabel,
  filterPayloadsByWindow,
  isPlottableCommit,
  isPlottablePayload,
  isMergedPayload,
  effectiveClassification,
  computePrMetrics,
  selectGlobalSummary,
  selectRepoSummaries,
  selectRepoPRs,
  selectContributorSummaries,
  selectAllCommits,
  selectAssistTrend,
  hoursBetween,
  formatDuration
} from './selectors.js'

function commit(overrides = {}) {
  return {
    commit: 'abc1234',
    committedAt: '2026-01-15T09:45:00.000Z',
    author: 'ada',
    subject: 'Add a chart',
    classification: 'Copilot-assisted',
    filesChanged: 1,
    linesAdded: 100,
    linesDeleted: 20,
    linesTouched: 120,
    netLines: 80,
    ...overrides
  }
}

const payloadWith = (commits, overrides = {}) =>
  buildPayload({ commitBreakdown: commits, ...overrides })

describe('#shortRepoName', () => {
  test('Should drop the owner from an owner/name pair', () => {
    expect(shortRepoName('DEFRA/mmo-cr-copilot-dashboard')).toBe(
      'mmo-cr-copilot-dashboard'
    )
  })

  test('Should return a bare name unchanged', () => {
    expect(shortRepoName('dashboard')).toBe('dashboard')
  })
})

describe('#classificationLabel', () => {
  test('Should present the canonical Non-flagged value as Human-authored', () => {
    expect(classificationLabel('Non-flagged')).toBe('Human-authored')
  })

  test('Should leave other classifications unchanged', () => {
    expect(classificationLabel('Copilot-assisted')).toBe('Copilot-assisted')
  })
})

describe('#filterPayloadsByWindow', () => {
  const early = buildPayload({ calculatedAt: '2026-01-01T00:00:00.000Z' })
  const late = buildPayload({ calculatedAt: '2026-02-01T00:00:00.000Z' })

  test('Should return every payload when the window is unbounded', () => {
    expect(filterPayloadsByWindow([early, late], null, null)).toHaveLength(2)
  })

  test('Should include the start of the window and exclude the end', () => {
    const filtered = filterPayloadsByWindow(
      [early, late],
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z'
    )

    expect(filtered).toEqual([early])
  })

  test('Should treat a missing upper bound as open ended', () => {
    expect(
      filterPayloadsByWindow([early, late], '2026-01-15T00:00:00.000Z', null)
    ).toEqual([late])
  })

  test('Should keep a payload with no usable timestamp', () => {
    const undated = buildPayload({
      calculatedAt: undefined,
      lastCommitAt: undefined,
      firstCommitAt: undefined
    })

    expect(
      filterPayloadsByWindow([undated], '2026-01-01T00:00:00.000Z', null)
    ).toEqual([undated])
  })
})

describe('#isPlottableCommit', () => {
  test('Should accept a complete commit', () => {
    expect(isPlottableCommit(commit())).toBe(true)
  })

  test.each([
    ['null', null],
    ['a missing sha', commit({ commit: '' })],
    ['an invalid date', commit({ committedAt: 'not-a-date' })],
    ['a missing date', commit({ committedAt: undefined })],
    ['an unknown classification', commit({ classification: 'Telepathy' })],
    ['a non-numeric linesTouched', commit({ linesTouched: null })]
  ])('Should reject a commit with %s', (_label, value) => {
    expect(isPlottableCommit(value)).toBe(false)
  })
})

describe('#isPlottablePayload', () => {
  test('Should accept a complete payload', () => {
    expect(isPlottablePayload(buildPayload())).toBe(true)
  })

  test.each([
    ['null', null],
    ['an empty repository', buildPayload({ repository: '' })],
    ['a missing summary', buildPayload({ summary: null })],
    ['a non-array commitBreakdown', buildPayload({ commitBreakdown: null })]
  ])('Should reject a payload with %s', (_label, value) => {
    expect(isPlottablePayload(value)).toBe(false)
  })
})

describe('#isMergedPayload', () => {
  test('Should accept a payload with a merge time', () => {
    expect(isMergedPayload(buildPayload())).toBe(true)
  })

  test.each([
    ['null', null],
    ['no merge time', buildPayload({ prMergedAt: undefined })],
    ['an empty merge time', buildPayload({ prMergedAt: '' })],
    ['an unparseable merge time', buildPayload({ prMergedAt: 'soon' })]
  ])('Should reject a payload with %s', (_label, value) => {
    expect(isMergedPayload(value)).toBe(false)
  })
})

describe('#effectiveClassification', () => {
  test('Should classify a merge commit as Rebase regardless of upstream', () => {
    expect(
      effectiveClassification(
        commit({
          subject: "Merge branch 'main' into feature/charts",
          classification: 'Human-authored'
        })
      )
    ).toBe('Rebase')
  })

  test('Should fall through to the upstream classification', () => {
    expect(effectiveClassification(commit())).toBe('Copilot-assisted')
  })

  test('Should tolerate a missing subject', () => {
    expect(effectiveClassification(commit({ subject: undefined }))).toBe(
      'Copilot-assisted'
    )
  })
})

describe('#computePrMetrics', () => {
  test('Should recompute totals from the commit breakdown', () => {
    const metrics = computePrMetrics(
      payloadWith([
        commit({ commit: 'a', classification: 'Copilot-assisted' }),
        commit({
          commit: 'b',
          classification: 'Human-authored',
          linesAdded: 50,
          linesDeleted: 10,
          linesTouched: 60
        })
      ])
    )

    expect(metrics.totalCommits).toBe(2)
    expect(metrics.copilotAssistedCommits).toBe(1)
    expect(metrics.humanAuthoredCommits).toBe(1)
    expect(metrics.totalLinesTouched).toBe(180)
    expect(metrics.netLines).toBe(120)
  })

  test('Should exclude rebase commits from every total', () => {
    const metrics = computePrMetrics(
      payloadWith([
        commit({ commit: 'a' }),
        commit({
          commit: 'b',
          subject: "Merge branch 'main' into feature/charts",
          classification: 'Human-authored',
          linesTouched: 5000,
          linesAdded: 5000,
          linesDeleted: 0
        })
      ])
    )

    expect(metrics.totalCommits).toBe(1)
    expect(metrics.rebaseCommits).toBe(1)
    expect(metrics.rebaseLines).toBe(5000)
    expect(metrics.totalLinesTouched).toBe(120)
    expect(metrics.copilotAssistedRate).toBe(100)
  })

  test('Should honour an upstream Rebase classification whatever the subject', () => {
    const metrics = computePrMetrics(
      payloadWith([
        commit({ commit: 'a' }),
        commit({
          commit: 'b',
          subject: 'Merge duplicate species records into one',
          classification: 'Rebase',
          linesTouched: 400,
          linesAdded: 400,
          linesDeleted: 0
        })
      ])
    )

    expect(metrics.totalCommits).toBe(1)
    expect(metrics.rebaseCommits).toBe(1)
    expect(metrics.rebaseLines).toBe(400)
  })

  test('Should exclude Dependabot commits from every total', () => {
    const metrics = computePrMetrics(
      payloadWith([
        commit({ commit: 'a' }),
        commit({
          commit: 'b',
          author: 'dependabot[bot]',
          subject: 'chore(deps): bump govuk-frontend from 5.7.0 to 5.8.0',
          classification: 'Dependabot',
          linesTouched: 900,
          linesAdded: 800,
          linesDeleted: 100
        })
      ])
    )

    expect(metrics.totalCommits).toBe(1)
    expect(metrics.dependabotCommits).toBe(1)
    expect(metrics.dependabotLines).toBe(900)
    expect(metrics.rebaseCommits).toBe(0)
    expect(metrics.totalLinesTouched).toBe(120)
    expect(metrics.byContributor.has('dependabot[bot]')).toBe(false)
  })

  test('Should not register an author seen only on rebase commits', () => {
    const metrics = computePrMetrics(
      payloadWith([
        commit({ commit: 'a', author: 'ada' }),
        commit({
          commit: 'b',
          author: 'merge-bot',
          subject: "Merge branch 'main'",
          classification: 'Human-authored'
        })
      ])
    )

    expect([...metrics.byContributor.keys()]).toEqual(['ada'])
  })

  test('Should skip commits that are not plottable', () => {
    const metrics = computePrMetrics(
      payloadWith([commit(), commit({ commit: 'b', committedAt: 'nonsense' })])
    )

    expect(metrics.totalCommits).toBe(1)
  })

  test('Should report zero rates for a payload with no usable commits', () => {
    const metrics = computePrMetrics(payloadWith([]))

    expect(metrics.copilotAssistedRate).toBe(0)
    expect(metrics.copilotAssistedLineRate).toBe(0)
    expect(metrics.reworkRatio).toBe(0)
  })

  test('Should express rework as deleted over added lines', () => {
    const metrics = computePrMetrics(
      payloadWith([commit({ linesAdded: 100, linesDeleted: 25 })])
    )

    expect(metrics.reworkRatio).toBe(0.25)
  })
})

describe('#selectGlobalSummary', () => {
  test('Should aggregate across repositories, PRs and contributors', () => {
    const summary = selectGlobalSummary([
      payloadWith([commit({ author: 'ada' })]),
      payloadWith(
        [commit({ author: 'grace', classification: 'Human-authored' })],
        {
          repository: 'DEFRA/other',
          prNumber: 7
        }
      )
    ])

    expect(summary.repoCount).toBe(2)
    expect(summary.prCount).toBe(2)
    expect(summary.contributorCount).toBe(2)
    expect(summary.totalCommits).toBe(2)
    expect(summary.copilotAssistedRate).toBe(50)
  })

  test('Should report zeroes for an empty feed', () => {
    const summary = selectGlobalSummary([])

    expect(summary.totalCommits).toBe(0)
    expect(summary.copilotAssistedRate).toBe(0)
    expect(summary.repoCount).toBe(0)
  })
})

describe('#selectRepoSummaries', () => {
  test('Should return one row per repository, highest adoption first', () => {
    const summaries = selectRepoSummaries([
      payloadWith([commit({ classification: 'Human-authored' })], {
        repository: 'DEFRA/low'
      }),
      payloadWith([commit()], { repository: 'DEFRA/high' })
    ])

    expect(summaries.map((row) => row.name)).toEqual(['high', 'low'])
    expect(summaries[0].copilotAssistedRate).toBe(100)
  })

  test('Should count distinct contributors per repository', () => {
    const [summary] = selectRepoSummaries([
      payloadWith([
        commit({ author: 'ada' }),
        commit({ commit: 'b', author: 'grace' })
      ])
    ])

    expect(summary.contributorCount).toBe(2)
    expect(summary.prCount).toBe(1)
  })
})

describe('#selectRepoPRs', () => {
  test('Should return only the requested repository', () => {
    const results = selectRepoPRs(
      [
        payloadWith([commit()], { repository: 'DEFRA/one' }),
        payloadWith([commit()], { repository: 'DEFRA/two', prNumber: 9 })
      ],
      'DEFRA/one'
    )

    expect(results).toHaveLength(1)
    expect(results[0].repository).toBe('DEFRA/one')
  })
})

describe('#selectContributorSummaries', () => {
  test('Should aggregate a contributor across repositories', () => {
    const summaries = selectContributorSummaries([
      payloadWith([commit({ author: 'ada' })], { repository: 'DEFRA/one' }),
      payloadWith(
        [commit({ author: 'ada', classification: 'Human-authored' })],
        {
          repository: 'DEFRA/two',
          prNumber: 9
        }
      )
    ])

    expect(summaries).toHaveLength(1)
    expect(summaries[0].contributor).toBe('ada')
    expect(summaries[0].totalCommits).toBe(2)
    expect(summaries[0].copilotAssistedRate).toBe(50)
  })
})

describe('#selectAllCommits', () => {
  test('Should flatten commits across payloads', () => {
    const commits = selectAllCommits([
      payloadWith([commit({ commit: 'a' }), commit({ commit: 'b' })]),
      payloadWith([commit({ commit: 'c' })], { prNumber: 9 })
    ])

    expect(commits).toHaveLength(3)
  })
})

describe('#selectAssistTrend', () => {
  test('Should produce a chronological series', () => {
    const trend = selectAssistTrend([
      payloadWith([commit()], { calculatedAt: '2026-01-16T10:00:00.000Z' }),
      payloadWith([commit()], {
        prNumber: 9,
        calculatedAt: '2026-01-15T10:00:00.000Z'
      })
    ])

    const dates = trend.map((point) => point.date ?? point[0])

    expect([...dates].sort()).toEqual(dates)
  })
})

describe('#hoursBetween', () => {
  test('Should measure the gap in hours', () => {
    expect(
      hoursBetween('2026-01-15T00:00:00.000Z', '2026-01-15T06:00:00.000Z')
    ).toBe(6)
  })

  test('Should return zero when a bound is missing', () => {
    expect(hoursBetween(null, '2026-01-15T06:00:00.000Z')).toBe(0)
    expect(hoursBetween('2026-01-15T00:00:00.000Z', null)).toBe(0)
  })
})

describe('#formatDuration', () => {
  test('Should render sub-hour durations in minutes', () => {
    expect(formatDuration(0.5)).toBe('30m')
  })

  test('Should render sub-day durations in hours', () => {
    expect(formatDuration(6)).toBe('6h')
  })

  test('Should render longer durations in days and hours', () => {
    expect(formatDuration(30)).toBe('1d 6h')
  })

  test('Should render whole days without a remainder', () => {
    expect(formatDuration(48)).toBe('2d')
  })

  test('Should render a dash for an unknown duration', () => {
    expect(formatDuration(null)).toBe('\u2014')
  })
})
