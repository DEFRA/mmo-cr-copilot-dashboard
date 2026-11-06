import {
  buildCommitV2,
  buildPayload,
  buildPayloadV2
} from '#/test-helpers/payload-fixture.js'
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
  selectRepoCycleTimes,
  selectRepoRework,
  selectRepoPRs,
  selectContributorSummaries,
  selectAllCommits,
  selectAssistTrend,
  selectPrCommitLines,
  hoursBetween,
  formatDuration,
  selectAiCodeChurnRate,
  selectCopilotUsage,
  selectCopilotInsights,
  foldModels,
  OTHER_MODELS_ID,
  selectModelRequestShares,
  selectDoneTickets,
  selectTicketFunnel,
  selectTicketRows
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

  test.each([
    ['extension', { source: 'extension', version: 1, typedLines: 4 }],
    ['legacy-trailer', { source: 'legacy-trailer' }],
    ['none', { source: 'none' }]
  ])('Should accept a v2 commit with %s attribution', (_label, attribution) => {
    expect(isPlottableCommit(buildCommitV2({ attribution }))).toBe(true)
  })
})

describe('#isPlottablePayload', () => {
  test('Should accept a complete payload', () => {
    expect(isPlottablePayload(buildPayload())).toBe(true)
  })

  test('Should accept a contract v2 payload', () => {
    expect(isPlottablePayload(buildPayloadV2())).toBe(true)
  })

  test('Should keep every entry of a mixed v1 and v2 feed', () => {
    const feed = [
      buildPayload({ prNumber: 1 }),
      buildPayloadV2({ prNumber: 2 }),
      buildPayloadV2({ prNumber: 3, jiraKeys: [] })
    ]

    expect(feed.filter(isPlottablePayload)).toEqual(feed)
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

  test('Should return null aiLineSharePercent when no extension attribution is present', () => {
    const metrics = computePrMetrics(payloadWith([commit()]))

    expect(metrics.aiLineSharePercent).toBeNull()
  })

  test('Should compute aiLineSharePercent from extension attribution lines', () => {
    const metrics = computePrMetrics(
      payloadWith([
        commit({
          attribution: {
            source: 'extension',
            version: 1,
            aiCompletionLines: 40,
            aiChatLines: 20,
            aiAgentLines: 20,
            pastedLines: 10,
            typedLines: 10
          }
        }),
        commit({
          commit: 'b',
          classification: 'Human-authored',
          attribution: {
            source: 'extension',
            version: 1,
            aiCompletionLines: 0,
            aiChatLines: 0,
            aiAgentLines: 0,
            pastedLines: 50,
            typedLines: 50
          }
        })
      ])
    )

    // Total AI: 80, Total human: 120 -> 80 / 200 = 40.00%
    expect(metrics.aiLineSharePercent).toBe(40)
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

  test('Should give the average batch size per repository', () => {
    const [summary] = selectRepoSummaries([
      payloadWith([commit(), commit({ commit: 'b', linesTouched: 60 })])
    ])

    expect(summary.avgCommitSize).toBe(90)
  })
})

describe('#selectRepoCycleTimes', () => {
  test('Should average cycle time per repository, fastest first', () => {
    const rows = selectRepoCycleTimes([
      payloadWith([commit()], {
        repository: 'DEFRA/slow',
        firstCommitAt: '2026-01-12T09:00:00.000Z',
        lastCommitAt: '2026-01-14T09:00:00.000Z'
      }),
      payloadWith([commit()], {
        repository: 'DEFRA/fast',
        firstCommitAt: '2026-01-12T09:00:00.000Z',
        lastCommitAt: '2026-01-12T11:00:00.000Z'
      }),
      payloadWith([commit()], {
        repository: 'DEFRA/fast',
        prNumber: 8,
        firstCommitAt: '2026-01-12T09:00:00.000Z',
        lastCommitAt: '2026-01-12T15:00:00.000Z'
      })
    ])

    expect(rows).toEqual([
      {
        repository: 'DEFRA/fast',
        name: 'fast',
        prCount: 2,
        avgCycleHours: 4,
        fastest: 2,
        slowest: 6
      },
      {
        repository: 'DEFRA/slow',
        name: 'slow',
        prCount: 1,
        avgCycleHours: 48,
        fastest: 48,
        slowest: 48
      }
    ])
  })

  test('Should report zero when no pull request has a cycle time', () => {
    const [row] = selectRepoCycleTimes([
      payloadWith([commit()], {
        firstCommitAt: '2026-01-12T09:00:00.000Z',
        lastCommitAt: '2026-01-12T09:00:00.000Z'
      })
    ])

    expect(row).toMatchObject({ avgCycleHours: 0, fastest: 0, slowest: 0 })
  })
})

describe('#selectRepoRework', () => {
  test('Should give net lines per repository', () => {
    const { repos } = selectRepoRework([payloadWith([commit()])])

    expect(repos[0]).toMatchObject({
      linesAdded: 100,
      linesDeleted: 20,
      netLines: 80
    })
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

describe('#selectPrCommitLines', () => {
  test('Should split counted commits by classification, oldest first', () => {
    const pr = buildPayload({
      commitBreakdown: [
        commit({ commit: 'late', committedAt: '2026-01-15T11:00:00.000Z' }),
        commit({
          commit: 'early',
          committedAt: '2026-01-15T08:00:00.000Z',
          classification: 'Human-authored',
          subject: undefined
        }),
        commit({ commit: 'merge', subject: "Merge branch 'main' into x" }),
        commit({ commit: 'bot', classification: 'Dependabot' }),
        commit({ commit: 'broken', linesAdded: undefined })
      ]
    })

    expect(selectPrCommitLines(pr)).toEqual([
      {
        commit: 'early',
        subject: '',
        category: 'Human-authored',
        added: 100,
        deleted: 20,
        touched: 120,
        copilot: 0,
        human: 120
      },
      {
        commit: 'late',
        subject: 'Add a chart',
        category: 'Copilot-assisted',
        added: 100,
        deleted: 20,
        touched: 120,
        copilot: 120,
        human: 0
      }
    ])
  })

  test('Should return nothing for a missing pull request', () => {
    expect(selectPrCommitLines(undefined)).toEqual([])
  })
})

describe('selectAiCodeChurnRate', () => {
  test('Should report unavailable without a measured pull request', () => {
    expect(selectAiCodeChurnRate(null)).toEqual({
      available: false,
      windowDays: 21,
      reason: null,
      prCount: 0
    })
    expect(
      selectAiCodeChurnRate({
        available: false,
        windowDays: 14,
        reason: 'None yet',
        prCount: 2
      })
    ).toEqual({
      available: false,
      windowDays: 14,
      reason: 'None yet',
      prCount: 2
    })
  })

  test('Should map the churn response, origins in a fixed order', () => {
    const rate = selectAiCodeChurnRate({
      available: true,
      windowDays: 21,
      churnRatePercent: 40,
      humanChurnPercent: 10,
      penaltyApplied: true,
      effectiveMultiplier: 0.6,
      prCount: 3,
      aiLinesMerged: 100,
      aiLinesSurviving: 60,
      byOrigin: { aiChat: { merged: 10, surviving: 5, churnPercent: 50 } }
    })

    expect(rate).toMatchObject({
      available: true,
      percent: 40,
      humanPercent: 10,
      penaltyApplied: true,
      multiplier: 0.6,
      prCount: 3
    })
    expect(rate.byOrigin.map((o) => o.label)).toEqual([
      'Agent',
      'Completion',
      'Chat'
    ])
    expect(rate.byOrigin[2]).toEqual({
      id: 'aiChat',
      label: 'Chat',
      merged: 10,
      surviving: 5,
      churnPercent: 50
    })
    expect(rate.byOrigin[0]).toMatchObject({ merged: 0, churnPercent: null })
  })

  test('Should default the multiplier and human churn when they are missing', () => {
    const rate = selectAiCodeChurnRate({ available: true, churnRatePercent: 5 })

    expect(rate.multiplier).toBe(1)
    expect(rate.humanPercent).toBeNull()
    expect(rate.penaltyApplied).toBe(false)
  })
})

describe('selectCopilotUsage', () => {
  const usageCommit = (models, source = 'extension') => ({
    ...buildCommitV2(),
    classification: 'Copilot-assisted',
    attribution: {
      source,
      version: 1,
      typedLines: 1,
      usage: { models, sessions: 1, commitsWithUsage: 1 }
    }
  })
  const model = (name, requests = 1, credits) => ({
    model: name,
    requests,
    inputTokens: 100,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    ...(credits === undefined ? {} : { credits })
  })

  test('Should total requests and AI credits per model across pull requests, most credits first', () => {
    const payloads = [
      buildPayloadV2({
        prNumber: 1,
        commitBreakdown: [
          usageCommit([model('small', 1, 0.5), model('big', 2, 3)])
        ]
      }),
      buildPayloadV2({
        prNumber: 2,
        commitBreakdown: [usageCommit([model('big', 1.5, 1.25)])]
      })
    ]

    const usage = selectCopilotUsage(payloads)

    expect(usage.models).toEqual([
      { model: 'big', requests: 3.5, credits: 4.25 },
      { model: 'small', requests: 1, credits: 0.5 }
    ])
    expect(usage).toMatchObject({
      prsWithUsage: 2,
      prsWithCredits: 2,
      assistedPrs: 2,
      coveragePercent: 100,
      totalCredits: 4.75,
      // PR 1 used 3.5 credits, PR 2 used 1.25; the median is to two places.
      medianCreditsPerPr: 2.38
    })
  })

  test('Should leave credits not recorded for usage without them, never deriving them from tokens', () => {
    const payloads = [
      buildPayloadV2({
        prNumber: 1,
        commitBreakdown: [
          usageCommit([model('old', 2), model('broken', 1, -1)])
        ]
      }),
      buildPayloadV2({
        prNumber: 2,
        commitBreakdown: [usageCommit([model('new', 1, 0.2)])]
      })
    ]

    const usage = selectCopilotUsage(payloads)

    expect(usage.models).toEqual([
      { model: 'new', requests: 1, credits: 0.2 },
      { model: 'old', requests: 2, credits: null },
      { model: 'broken', requests: 1, credits: null }
    ])
    expect(usage).toMatchObject({
      prsWithUsage: 2,
      prsWithCredits: 1,
      totalCredits: 0.2,
      medianCreditsPerPr: 0.2
    })
  })

  test('Should report coverage against Copilot-assisted pull requests only', () => {
    const assistedWithout = {
      ...buildCommitV2(),
      classification: 'Copilot-assisted',
      attribution: { source: 'legacy-trailer' }
    }
    const human = { ...buildCommitV2(), classification: 'Human-authored' }
    const payloads = [
      buildPayloadV2({
        prNumber: 1,
        commitBreakdown: [usageCommit([model('m')])]
      }),
      buildPayloadV2({ prNumber: 2, commitBreakdown: [assistedWithout] }),
      buildPayloadV2({ prNumber: 3, commitBreakdown: [human] })
    ]

    const usage = selectCopilotUsage(payloads)

    expect(usage.assistedPrs).toBe(2)
    expect(usage.prsWithUsage).toBe(1)
    expect(usage.coveragePercent).toBe(50)
  })

  test('Should ignore usage that is not extension attribution or is malformed', () => {
    const usage = selectCopilotUsage([
      buildPayloadV2({
        commitBreakdown: [
          usageCommit([model('m')], 'legacy-trailer'),
          usageCommit([{ model: 7 }, null, model('ok')]),
          {
            ...buildCommitV2(),
            attribution: {
              source: 'extension',
              version: 1,
              usage: { models: 'x' }
            }
          }
        ]
      })
    ])

    expect(usage.models.map((m) => m.model)).toEqual(['ok'])
  })

  test('Should return an empty result with no payloads', () => {
    expect(selectCopilotUsage(undefined)).toEqual({
      models: [],
      prsWithUsage: 0,
      prsWithCredits: 0,
      assistedPrs: 0,
      coveragePercent: null,
      totalCredits: null,
      medianCreditsPerPr: null
    })
    expect(selectCopilotUsage([buildPayloadV2()]).medianCreditsPerPr).toBeNull()
  })
})

describe('selectCopilotInsights', () => {
  const usageCommit = (models, overrides = {}) => ({
    ...buildCommitV2(),
    author: 'ada',
    committedAt: '2026-01-15T12:00:00',
    classification: 'Copilot-assisted',
    attribution: {
      source: 'extension',
      version: 1,
      typedLines: 1,
      usage: { models, sessions: 1, commitsWithUsage: 1 }
    },
    ...overrides
  })
  const usageModel = (name, extra = {}) => ({
    model: name,
    requests: 1,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    ...extra
  })
  const pr = (prNumber, ...commits) =>
    buildPayloadV2({ prNumber, commitBreakdown: commits })
  const twoPrs = (extra, commitOverrides = {}, name = 'solo') => [
    pr(1, usageCommit([usageModel(name, extra)], commitOverrides)),
    pr(2, usageCommit([usageModel(name, extra)], commitOverrides))
  ]
  const ids = (insights) => insights.superlatives.map((s) => s.id)
  const modelOf = (insights, name) =>
    insights.models.find((m) => m.model === name)

  test('Should return an empty result with no payloads', () => {
    for (const input of [undefined, []]) {
      const insights = selectCopilotInsights(input)

      expect(insights.hasUsage).toBe(false)
      expect(insights.models).toEqual([])
      expect(insights.favourite).toBeNull()
      expect(insights.superlatives).toEqual([])
      expect(insights.totals).toEqual({
        requests: 0,
        credits: null,
        creditsPerRequest: null
      })
      expect(insights.variety).toEqual({
        distinctModels: 0,
        effectiveModels: null,
        multiModelPrShare: null
      })
      expect(insights.coverage.coveragePercent).toBeNull()
      expect(insights.medianCreditsPerPr).toBeNull()
    }
  })

  test('Should aggregate a model across commits and count distinct pull requests', () => {
    const insights = selectCopilotInsights([
      pr(
        1,
        usageCommit([usageModel('gpt', { requests: 2, credits: 1.5 })]),
        usageCommit([usageModel('gpt', { requests: 3, credits: 2 })])
      ),
      pr(2, usageCommit([usageModel('gpt', { credits: 0.5 })]))
    ])

    expect(insights.hasUsage).toBe(true)
    expect(insights.models).toHaveLength(1)
    expect(insights.models[0]).toEqual({
      model: 'gpt',
      requests: 6,
      credits: 4,
      requestShare: 100,
      creditShare: 100,
      creditsPerRequest: 0.6667,
      outOfHoursShare: 0,
      prCount: 2,
      reserved: false,
      rank: 1
    })
    expect(insights.totals).toEqual({
      requests: 6,
      credits: 4,
      creditsPerRequest: 0.6667
    })
    expect(insights.coverage).toEqual({
      prsWithUsage: 2,
      prsWithCredits: 2,
      assistedPrs: 2,
      coveragePercent: 100
    })
    // PR 1 used 3.5 credits, PR 2 used 0.5.
    expect(insights.medianCreditsPerPr).toBe(2)
  })

  test('Should price credits per request only from requests that recorded credits', () => {
    const insights = selectCopilotInsights([
      pr(1, usageCommit([usageModel('gpt', { requests: 2, credits: 1 })])),
      pr(2, usageCommit([usageModel('gpt', { requests: 4 })])),
      pr(3, usageCommit([usageModel('legacy', { requests: 2 })]))
    ])

    expect(modelOf(insights, 'gpt')).toMatchObject({
      requests: 6,
      credits: 1,
      creditsPerRequest: 0.5
    })
    expect(modelOf(insights, 'legacy')).toMatchObject({
      credits: null,
      creditShare: null,
      creditsPerRequest: null
    })
    expect(insights.totals).toEqual({
      requests: 8,
      credits: 1,
      creditsPerRequest: 0.5
    })
    expect(insights.coverage.prsWithCredits).toBe(1)
  })

  test('Should count the same pull request number in different repositories separately', () => {
    const insights = selectCopilotInsights([
      buildPayloadV2({
        repository: 'DEFRA/one',
        prNumber: 1,
        commitBreakdown: [usageCommit([usageModel('gpt')])]
      }),
      buildPayloadV2({
        repository: 'DEFRA/two',
        prNumber: 1,
        commitBreakdown: [usageCommit([usageModel('gpt')])]
      })
    ])

    expect(insights.models[0].prCount).toBe(2)
  })

  test('Should ignore non-extension attribution and malformed models', () => {
    const insights = selectCopilotInsights([
      pr(
        1,
        usageCommit([usageModel('legacy')], {
          attribution: { source: 'legacy-trailer', usage: { models: [] } }
        }),
        usageCommit([{ model: 7 }, null, usageModel(''), usageModel('ok')]),
        {
          ...buildCommitV2(),
          attribution: { source: 'extension', usage: { models: 'x' } }
        },
        { ...buildCommitV2(), attribution: { source: 'extension' } },
        null
      )
    ])

    expect(insights.models.map((m) => m.model)).toEqual(['ok'])
  })

  test('Should sort by requests, then credits, then name, and rank only named models', () => {
    const insights = selectCopilotInsights([
      pr(
        1,
        usageCommit([
          usageModel('other', { requests: 10 }),
          usageModel('beta', { requests: 3, credits: 0.5 }),
          usageModel('alpha', { requests: 3, credits: 0.5 }),
          usageModel('gamma', { requests: 3, credits: 5 }),
          usageModel('unknown', { requests: 1 })
        ])
      )
    ])

    expect(insights.models.map((m) => [m.model, m.rank, m.reserved])).toEqual([
      ['other', null, true],
      ['gamma', 1, false],
      ['alpha', 2, false],
      ['beta', 3, false],
      ['unknown', null, true]
    ])
  })

  test('Should use the whole fleet, reserved models included, as the share denominator', () => {
    const insights = selectCopilotInsights([
      pr(
        1,
        usageCommit([
          usageModel('gpt', { requests: 3, credits: 8 }),
          usageModel('other', { requests: 1, credits: 2 })
        ])
      )
    ])

    expect(modelOf(insights, 'gpt')).toMatchObject({
      requestShare: 75,
      creditShare: 80
    })
    expect(modelOf(insights, 'other')).toMatchObject({
      requestShare: 25,
      creditShare: 20
    })
  })

  test('Should report zero shares when nothing was requested or spent', () => {
    const insights = selectCopilotInsights([
      pr(1, usageCommit([usageModel('gpt', { requests: 0, credits: 0 })]))
    ])

    expect(insights.models[0]).toMatchObject({
      requestShare: 0,
      creditShare: 0,
      creditsPerRequest: null
    })
  })

  describe('favourite', () => {
    test('Should be the leading named model with its lead over the runner-up', () => {
      const insights = selectCopilotInsights([
        pr(
          1,
          usageCommit([
            usageModel('other', { requests: 10 }),
            usageModel('alpha', { requests: 6 }),
            usageModel('beta', { requests: 2 })
          ])
        ),
        pr(2, usageCommit([usageModel('alpha', { requests: 2 })]))
      ])

      expect(insights.favourite).toEqual({
        model: 'alpha',
        requests: 8,
        requestShare: 40,
        prCount: 2,
        leadPoints: 30
      })
    })

    test('Should break a request tie on credits, then name', () => {
      const byCredits = selectCopilotInsights([
        pr(
          1,
          usageCommit([
            usageModel('alpha', { credits: 0.1 }),
            usageModel('beta', { credits: 0.9 })
          ])
        )
      ])
      const byName = selectCopilotInsights([
        pr(1, usageCommit([usageModel('beta'), usageModel('alpha')]))
      ])

      expect(byCredits.favourite.model).toBe('beta')
      expect(byCredits.favourite.leadPoints).toBe(0)
      expect(byName.favourite.model).toBe('alpha')
    })

    test('Should fall back to the highest credit model when none has requests', () => {
      const insights = selectCopilotInsights([
        pr(
          1,
          usageCommit([
            usageModel('alpha', { requests: 0, credits: 0.5 }),
            usageModel('beta', { requests: 0, credits: 5 })
          ])
        )
      ])

      expect(insights.favourite.model).toBe('beta')
    })

    test('Should be the whole share when there is no runner-up', () => {
      const insights = selectCopilotInsights([
        pr(1, usageCommit([usageModel('solo', { requests: 4 })]))
      ])

      expect(insights.favourite).toMatchObject({
        requestShare: 100,
        leadPoints: 100
      })
    })

    test('Should skip other and unknown, and be null when only those exist', () => {
      const onlyReserved = selectCopilotInsights([
        pr(
          1,
          usageCommit([
            usageModel('other', { requests: 9 }),
            usageModel('unknown', { requests: 9 })
          ])
        )
      ])

      expect(onlyReserved.hasUsage).toBe(true)
      expect(onlyReserved.favourite).toBeNull()
      expect(onlyReserved.variety.distinctModels).toBe(0)
    })
  })

  describe('out-of-hours share', () => {
    test('Should measure out-of-hours in local time, 19:00 up to 07:00', () => {
      const at = (committedAt, requests) =>
        usageCommit([usageModel('owl', { requests })], { committedAt })
      const insights = selectCopilotInsights([
        pr(1, at('2026-01-15T19:00:00', 1), at('2026-01-15T07:00:00', 1)),
        pr(2, at('2026-01-15T06:59:00', 1), at('2026-01-15T18:59:00', 1))
      ])

      // 19:00 and 06:59 are out of hours; 07:00 and 18:59 are not.
      expect(insights.models[0].outOfHoursShare).toBe(50)
    })

    test('Should leave commits with an unreadable date out of the out-of-hours share', () => {
      const at = (committedAt, requests) =>
        usageCommit([usageModel('owl', { requests })], { committedAt })
      const insights = selectCopilotInsights([
        pr(1, at('2026-01-15T22:00:00', 1), at('not a date', 9))
      ])

      expect(insights.models[0].requests).toBe(10)
      expect(insights.models[0].outOfHoursShare).toBe(100)
    })

    test('Should be null when no commit has a readable date', () => {
      const insights = selectCopilotInsights([
        pr(1, usageCommit([usageModel('owl')], { committedAt: undefined }))
      ])

      expect(insights.models[0].outOfHoursShare).toBeNull()
    })
  })

  describe('variety', () => {
    test('Should compute effective models and the multi-model pull request share', () => {
      const insights = selectCopilotInsights([
        pr(
          1,
          usageCommit([
            usageModel('alpha'),
            usageModel('beta'),
            usageModel('other')
          ])
        ),
        pr(2, usageCommit([usageModel('alpha', { requests: 2 })]))
      ])

      // Shares 0.75 and 0.25 give 1 / 0.625.
      expect(insights.variety).toEqual({
        distinctModels: 2,
        effectiveModels: 1.6,
        multiModelPrShare: 50
      })
    })

    test('Should not count a reserved model as a second model', () => {
      const insights = selectCopilotInsights([
        pr(1, usageCommit([usageModel('alpha'), usageModel('other')]))
      ])

      expect(insights.variety).toEqual({
        distinctModels: 1,
        effectiveModels: 1,
        multiModelPrShare: 0
      })
    })

    test('Should have no effective models when named models made no requests', () => {
      const insights = selectCopilotInsights([
        pr(1, usageCommit([usageModel('alpha', { requests: 0 })]))
      ])

      expect(insights.variety.effectiveModels).toBeNull()
      expect(insights.variety.distinctModels).toBe(1)
    })
  })

  describe('superlatives', () => {
    test('Should need a model to be used on at least two pull requests', () => {
      const insights = selectCopilotInsights([
        pr(1, usageCommit([usageModel('solo', { credits: 999 })]))
      ])

      expect(insights.superlatives).toEqual([])
    })

    test('Should award biggest-spender only for recorded, non-zero credits', () => {
      expect(ids(selectCopilotInsights(twoPrs({})))).not.toContain(
        'biggest-spender'
      )
      expect(ids(selectCopilotInsights(twoPrs({ credits: 0 })))).not.toContain(
        'biggest-spender'
      )

      const awarded = selectCopilotInsights(twoPrs({ credits: 1 }))

      expect(awarded.superlatives[0]).toEqual({
        id: 'biggest-spender',
        model: 'solo',
        metric: 'creditShare',
        value: 100
      })
    })

    test('Should award best-value from 5 requests with recorded credits', () => {
      const below = twoPrs({ requests: 2, credits: 1 })
      const unpriced = twoPrs({ requests: 3 })
      const at = twoPrs({ requests: 3, credits: 1.5 })

      expect(ids(selectCopilotInsights(below))).not.toContain('best-value')
      expect(ids(selectCopilotInsights(unpriced))).not.toContain('best-value')
      expect(
        selectCopilotInsights(at).superlatives.find(
          (s) => s.id === 'best-value'
        )
      ).toMatchObject({ metric: 'creditsPerRequest', value: 0.5 })
    })

    test('Should pick the lowest credits per request for best-value', () => {
      const priced = (name, credits) => [
        pr(1, usageCommit([usageModel(name, { requests: 5, credits })])),
        pr(2, usageCommit([usageModel(name, { requests: 5, credits })]))
      ]
      const insights = selectCopilotInsights([
        ...priced('thrifty', 0.5),
        ...priced('lavish', 50)
      ])

      expect(
        insights.superlatives.find((s) => s.id === 'best-value').model
      ).toBe('thrifty')
    })

    test('Should award night-owl from 5 requests with some out-of-hours work', () => {
      const night = { committedAt: '2026-01-15T22:30:00' }
      const day = { committedAt: '2026-01-15T11:00:00' }

      expect(
        ids(selectCopilotInsights(twoPrs({ requests: 2 }, night)))
      ).not.toContain('night-owl')
      expect(
        ids(selectCopilotInsights(twoPrs({ requests: 3 }, day)))
      ).not.toContain('night-owl')
      expect(
        selectCopilotInsights(twoPrs({ requests: 3 }, night)).superlatives.find(
          (s) => s.id === 'night-owl'
        )
      ).toMatchObject({ metric: 'outOfHoursShare', value: 100 })
    })

    test('Should award prompt-polyglot to the team, not a model', () => {
      const insights = selectCopilotInsights([
        pr(1, usageCommit([usageModel('alpha'), usageModel('beta')])),
        pr(2, usageCommit([usageModel('alpha')]))
      ])
      const polyglot = insights.superlatives.find(
        (s) => s.id === 'prompt-polyglot'
      )

      expect(polyglot).toEqual({
        id: 'prompt-polyglot',
        model: null,
        metric: 'distinctModels',
        value: 2,
        multiModelPrShare: 50
      })
      expect(ids(selectCopilotInsights(twoPrs({})))).not.toContain(
        'prompt-polyglot'
      )
    })

    test('Should keep reserved models out of model awards', () => {
      const insights = selectCopilotInsights(
        twoPrs({ credits: 50 }, {}, 'other')
      )

      expect(insights.superlatives).toEqual([])
    })

    test('Should break a tie on requests, then name', () => {
      const both = (xRequests, yRequests) => [
        pr(
          1,
          usageCommit([
            usageModel('x', { requests: xRequests, credits: 1 }),
            usageModel('y', { requests: yRequests, credits: 1 })
          ])
        ),
        pr(
          2,
          usageCommit([
            usageModel('x', { requests: xRequests, credits: 1 }),
            usageModel('y', { requests: yRequests, credits: 1 })
          ])
        )
      ]
      const spender = (payloads) =>
        selectCopilotInsights(payloads).superlatives.find(
          (s) => s.id === 'biggest-spender'
        ).model

      expect(spender(both(1, 1))).toBe('x')
      expect(spender(both(1, 2))).toBe('y')
    })

    test('Should list awards in a fixed order', () => {
      const insights = selectCopilotInsights([
        pr(
          1,
          usageCommit(
            [
              usageModel('alpha', { requests: 5, credits: 10 }),
              usageModel('beta')
            ],
            { committedAt: '2026-01-15T23:00:00' }
          )
        ),
        pr(
          2,
          usageCommit([
            usageModel('alpha', { requests: 5, credits: 2 }),
            usageModel('beta')
          ])
        )
      ])

      expect(ids(insights)).toEqual([
        'biggest-spender',
        'best-value',
        'night-owl',
        'prompt-polyglot'
      ])
    })
  })

  test('Should never expose commit authors or contributors', () => {
    const payloads = [
      buildPayloadV2({
        prNumber: 1,
        commitBreakdown: [
          usageCommit([usageModel('gpt', { requests: 2, inputTokens: 10 })], {
            author: 'ada'
          })
        ]
      }),
      buildPayloadV2({
        prNumber: 2,
        commitBreakdown: [
          usageCommit([usageModel('gpt', { requests: 2, inputTokens: 10 })], {
            author: 'ada'
          })
        ]
      })
    ]

    expect(JSON.stringify(selectCopilotInsights(payloads))).not.toContain('ada')
  })
})

describe('foldModels', () => {
  const models = [
    { model: 'a', requests: 5, totalTokens: 10 },
    { model: 'b', requests: 9, totalTokens: 1 },
    { model: 'c', requests: 2, totalTokens: 30 },
    { model: 'd', requests: 1, totalTokens: 20 }
  ]

  test('Should return everything, largest first, when within the limit', () => {
    expect(foldModels(models, 4, 'requests').map((m) => m.model)).toEqual([
      'b',
      'a',
      'c',
      'd'
    ])
    expect(foldModels(models, 10, 'requests')).toHaveLength(4)
  })

  test('Should merge the remainder into Other models', () => {
    expect(foldModels(models, 2, 'requests')).toEqual([
      models[1],
      models[0],
      { model: 'Other models', requests: 3 }
    ])
  })

  test('Should rank by the key it is given', () => {
    const folded = foldModels(models, 1, 'totalTokens')

    expect(folded[0].model).toBe('c')
    expect(folded[1]).toEqual({ model: 'Other models', totalTokens: 31 })
  })

  test('Should not mutate its input and should tolerate no models', () => {
    const copy = structuredClone(models)

    foldModels(models, 1, 'requests')

    expect(models).toEqual(copy)
    expect(foldModels(undefined, 3, 'requests')).toEqual([])
  })
})

describe('selectModelRequestShares', () => {
  test('Should give each model its share of requests, largest first', () => {
    const shares = selectModelRequestShares([
      { model: 'a', requests: 1 },
      { model: 'b', requests: 3 }
    ])

    expect(shares).toEqual([
      { id: 'model:b', model: 'b', requests: 3, share: 75 },
      { id: 'model:a', model: 'a', requests: 1, share: 25 }
    ])
  })

  test('Should fold the tail into Other models past the limit', () => {
    const shares = selectModelRequestShares(
      [
        { model: 'a', requests: 4 },
        { model: 'b', requests: 3 },
        { model: 'c', requests: 2 },
        { model: 'd', requests: 1 }
      ],
      2
    )

    expect(shares.map((s) => s.model)).toEqual(['a', 'b', 'Other models'])
    expect(shares[2]).toEqual({
      id: OTHER_MODELS_ID,
      model: 'Other models',
      requests: 3,
      share: 30
    })
  })

  test('Should keep a model called Other models apart from the folded tail', () => {
    const shares = selectModelRequestShares(
      [
        { model: 'Other models', requests: 4 },
        { model: 'b', requests: 3 },
        { model: 'c', requests: 2 }
      ],
      1
    )

    expect(shares.map((s) => s.id)).toEqual([
      'model:Other models',
      OTHER_MODELS_ID
    ])
  })

  test('Should leave out models without requests', () => {
    const shares = selectModelRequestShares([
      { model: 'a', requests: 0 },
      { model: 'b', requests: 2 },
      { model: 'c', requests: null }
    ])

    expect(shares).toEqual([
      { id: 'model:b', model: 'b', requests: 2, share: 100 }
    ])
  })

  test('Should treat a string count as no requests rather than produce NaN', () => {
    const shares = selectModelRequestShares([
      { model: 'a', requests: '5' },
      { model: 'b', requests: 2 },
      { model: 'c', requests: 'many' }
    ])

    expect(shares).toEqual([
      { id: 'model:b', model: 'b', requests: 2, share: 100 }
    ])
  })

  test('Should return nothing when there are no requests', () => {
    expect(selectModelRequestShares([])).toEqual([])
    expect(selectModelRequestShares(undefined)).toEqual([])
  })
})

describe('#selectTicketRows workflow flow', () => {
  const at = (day) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`
  const flowed = (
    key,
    flow,
    status = { name: 'Closed', categoryKey: 'new' }
  ) => ({
    key,
    status,
    created: at(1),
    started: at(2),
    resolved: at(3),
    reopenCount: 9,
    flow
  })

  test('Should use the backend flow over the Jira fields', () => {
    const [row] = selectTicketRows(
      [
        flowed('A-1', {
          stageKind: 'done',
          startedAt: at(4),
          doneAt: at(10),
          firstDoneAt: at(8),
          cycleDays: 6,
          leadDays: 9,
          flowEfficiency: 75,
          reopenCount: 1
        })
      ],
      []
    )

    expect(row).toMatchObject({
      category: 'done',
      stageKind: 'done',
      started: Date.parse(at(4)),
      resolved: Date.parse(at(10)),
      firstDone: Date.parse(at(8)),
      cycleDays: 6,
      leadDays: 9,
      flowEfficiency: 75,
      reopenCount: 1
    })
  })

  test.each([
    ['todo', 'new'],
    ['active', 'indeterminate'],
    ['waiting', 'indeterminate'],
    ['done', 'done']
  ])('Should place a %s stage in the %s category', (stageKind, category) => {
    const [row] = selectTicketRows([flowed('A-1', { stageKind })], [])
    expect(row.category).toBe(category)
  })

  test('Should keep the Jira category for unmapped or excluded statuses', () => {
    const rows = selectTicketRows(
      [
        flowed('A-1', { stageKind: 'unmapped' }),
        flowed('A-2', { stageKind: 'excluded' }, { name: 'Odd' })
      ],
      []
    )
    expect(rows.map((r) => r.category)).toEqual(['new', ''])
  })

  test('Should read missing or malformed flow values as null', () => {
    const [row] = selectTicketRows(
      [
        flowed('A-1', {
          stageKind: 42,
          startedAt: 'not a date',
          cycleDays: '6',
          leadDays: NaN
        })
      ],
      []
    )
    expect(row).toMatchObject({
      stageKind: null,
      started: null,
      resolved: null,
      firstDone: null,
      cycleDays: null,
      leadDays: null,
      flowEfficiency: null,
      reopenCount: 0
    })
  })

  test('Should count Done and the funnel from the workflow stages', () => {
    const rows = selectTicketRows(
      [
        flowed('A-1', { stageKind: 'done', doneAt: at(10) }),
        flowed('A-2', { stageKind: 'active' }, { categoryKey: 'done' }),
        flowed('A-3', { stageKind: 'todo' })
      ],
      []
    )
    expect(selectDoneTickets(rows, at(1), at(20)).map((r) => r.key)).toEqual([
      'A-1'
    ])
    expect(selectTicketFunnel(rows)).toEqual([1, 1, 0, 1])
  })

  test('Should fall back to Jira started and resolved without a flow', () => {
    const [row] = selectTicketRows(
      [
        {
          key: 'A-1',
          status: { categoryKey: 'done' },
          created: at(1),
          started: at(2),
          resolved: at(5),
          firstDoneAt: at(4),
          reopenCount: 2
        }
      ],
      []
    )
    expect(row).toMatchObject({
      category: 'done',
      stageKind: null,
      started: Date.parse(at(2)),
      resolved: Date.parse(at(5)),
      firstDone: Date.parse(at(4)),
      cycleDays: 3,
      leadDays: 4,
      flowEfficiency: null,
      reopenCount: 2
    })
  })

  test('Should treat an unresolved ticket without a flow as not done', () => {
    const [row] = selectTicketRows([{ key: 'A-1', created: at(1) }], [])
    expect(row).toMatchObject({
      category: '',
      started: Date.parse(at(1)),
      resolved: null,
      firstDone: null,
      cycleDays: null,
      leadDays: null
    })
  })
})
