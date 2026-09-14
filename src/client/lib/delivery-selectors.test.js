import {
  buildCommit,
  buildPayloadFromCommits
} from '#/test-helpers/payload-fixture.js'
import {
  selectContributorPRs,
  selectContributorRepoMatrix,
  selectDeliveryMetrics,
  selectRepoRework,
  selectCopilotLeverage,
  selectDeliverySummary,
  selectCommitTimeline,
  selectRepoProfiles,
  selectPersonaSummaries
} from './selectors.js'

const copilotCommit = (overrides) =>
  buildCommit({ classification: 'Copilot-assisted', ...overrides })

const humanCommit = (overrides) =>
  buildCommit({ classification: 'Human-authored', ...overrides })

/** A PR whose cycle time and assist mix are set explicitly. */
function pullRequest({
  prNumber = 1,
  repository = 'DEFRA/repo-a',
  cycleHours = 24,
  commits = [copilotCommit({ commit: `c${prNumber}` })],
  ...overrides
} = {}) {
  const firstCommitAt = new Date('2026-01-10T00:00:00.000Z')
  const lastCommitAt = new Date(
    firstCommitAt.getTime() + cycleHours * 60 * 60 * 1000
  )

  return buildPayloadFromCommits(commits, {
    prNumber,
    repository,
    firstCommitAt: firstCommitAt.toISOString(),
    lastCommitAt: lastCommitAt.toISOString(),
    ...overrides
  })
}

describe('#selectContributorPRs', () => {
  const payloads = [
    pullRequest({
      prNumber: 1,
      calculatedAt: '2026-01-10T10:00:00.000Z',
      commits: [
        copilotCommit({ commit: 'a1', author: 'ada' }),
        humanCommit({ commit: 'b1', author: 'grace' })
      ]
    }),
    pullRequest({
      prNumber: 2,
      calculatedAt: '2026-01-12T10:00:00.000Z',
      commits: [copilotCommit({ commit: 'a2', author: 'ada' })]
    })
  ]

  test('Should return only the PRs a contributor worked on', () => {
    expect(
      selectContributorPRs(payloads, 'grace').map((pr) => pr.prNumber)
    ).toEqual([1])
  })

  test('Should order the PRs newest first', () => {
    expect(
      selectContributorPRs(payloads, 'ada').map((pr) => pr.prNumber)
    ).toEqual([2, 1])
  })

  test("Should include only that contributor's commits", () => {
    const [, first] = selectContributorPRs(payloads, 'ada')

    expect(first.commits.map((commit) => commit.author)).toEqual(['ada'])
  })

  test('Should report the assist rate for that contributor alone', () => {
    const [pr] = selectContributorPRs(payloads, 'grace')

    expect(pr.copilotAssistedRate).toBe(0)
  })

  test('Should return nothing for an unknown contributor', () => {
    expect(selectContributorPRs(payloads, 'nobody')).toEqual([])
  })
})

describe('#selectContributorRepoMatrix', () => {
  const payloads = [
    pullRequest({
      repository: 'DEFRA/repo-a',
      commits: [copilotCommit({ author: 'ada' })]
    }),
    pullRequest({
      prNumber: 2,
      repository: 'DEFRA/repo-b',
      commits: [humanCommit({ author: 'grace' })]
    })
  ]

  test('Should list every contributor and repository', () => {
    const matrix = selectContributorRepoMatrix(payloads)

    expect(matrix.contributors).toEqual(['ada', 'grace'])
    expect(matrix.repos).toEqual(['repo-a', 'repo-b'])
  })

  test('Should emit one cell per repository and contributor pair', () => {
    expect(selectContributorRepoMatrix(payloads).data).toHaveLength(4)
  })

  test('Should report the assist rate in populated cells', () => {
    const { data } = selectContributorRepoMatrix(payloads)
    const cell = (x, y) => data.find(([cx, cy]) => cx === x && cy === y)[2]

    expect(cell(0, 0)).toBe(100)
    expect(cell(1, 1)).toBe(0)
  })

  test('Should leave cells with no activity empty', () => {
    const { data } = selectContributorRepoMatrix(payloads)

    expect(data.find(([x, y]) => x === 1 && y === 0)[2]).toBeNull()
  })

  test('Should tolerate no payloads', () => {
    expect(selectContributorRepoMatrix([])).toEqual({
      contributors: [],
      repos: [],
      data: []
    })
  })
})

describe('#selectDeliveryMetrics', () => {
  test('Should derive cycle time from the first and last commit', () => {
    const [metrics] = selectDeliveryMetrics([pullRequest({ cycleHours: 36 })])

    expect(metrics.cycleHours).toBe(36)
  })

  test('Should derive time to merge from creation and merge', () => {
    const [metrics] = selectDeliveryMetrics([
      pullRequest({
        prCreatedAt: '2026-01-10T00:00:00.000Z',
        prMergedAt: '2026-01-11T00:00:00.000Z'
      })
    ])

    expect(metrics.timeToMergeHours).toBe(24)
  })

  test('Should mark a PR with a merge timestamp as completed', () => {
    const [metrics] = selectDeliveryMetrics([pullRequest()])

    expect(metrics.completed).toBe(true)
  })

  test('Should mark a PR without a merge timestamp as in progress', () => {
    const [metrics] = selectDeliveryMetrics([
      pullRequest({ prMergedAt: undefined })
    ])

    expect(metrics.completed).toBe(false)
    expect(metrics.prMergedAt).toBeNull()
  })

  test('Should report the average commit size', () => {
    const [metrics] = selectDeliveryMetrics([
      pullRequest({
        commits: [
          copilotCommit({ commit: 'a', linesAdded: 80, linesDeleted: 20 }),
          copilotCommit({ commit: 'b', linesAdded: 80, linesDeleted: 20 })
        ]
      })
    ])

    expect(metrics.avgCommitSize).toBe(100)
  })

  test('Should order the metrics chronologically', () => {
    const metrics = selectDeliveryMetrics([
      pullRequest({ prNumber: 2, calculatedAt: '2026-02-01T00:00:00.000Z' }),
      pullRequest({ prNumber: 1, calculatedAt: '2026-01-01T00:00:00.000Z' })
    ])

    expect(metrics.map((entry) => entry.prNumber)).toEqual([1, 2])
  })
})

describe('#selectRepoRework', () => {
  const payloads = [
    pullRequest({
      repository: 'DEFRA/repo-a',
      commits: [copilotCommit({ linesAdded: 100, linesDeleted: 50 })]
    }),
    pullRequest({
      prNumber: 2,
      repository: 'DEFRA/repo-b',
      commits: [copilotCommit({ linesAdded: 100, linesDeleted: 10 })]
    })
  ]

  test('Should compute the rework ratio per repository', () => {
    const { repos } = selectRepoRework(payloads)

    expect(repos.map((repo) => repo.reworkRatio)).toEqual([0.5, 0.1])
  })

  test('Should order repositories by rework ratio, worst first', () => {
    const { repos } = selectRepoRework(payloads)

    expect(repos.map((repo) => repo.name)).toEqual(['repo-a', 'repo-b'])
  })

  test('Should weight the portfolio ratio by lines added', () => {
    const { portfolioReworkRatio, totalAdded, totalDeleted } =
      selectRepoRework(payloads)

    expect(totalAdded).toBe(200)
    expect(totalDeleted).toBe(60)
    expect(portfolioReworkRatio).toBe(0.3)
  })

  test('Should report zero rework when nothing was added', () => {
    expect(selectRepoRework([]).portfolioReworkRatio).toBe(0)
  })
})

describe('#selectCopilotLeverage', () => {
  test('Should report zero leverage with no payloads', () => {
    const leverage = selectCopilotLeverage([])

    expect(leverage.leveragePct).toBe(0)
    expect(leverage.repos).toEqual([])
  })

  test('Should report coverage as the Copilot share of lines touched', () => {
    const leverage = selectCopilotLeverage([
      pullRequest({
        commits: [
          copilotCommit({ commit: 'a', linesAdded: 60, linesDeleted: 0 }),
          humanCommit({ commit: 'b', linesAdded: 40, linesDeleted: 0 })
        ]
      })
    ])

    expect(leverage.coverage).toBe(60)
  })

  test('Should report adoption as the share of contributors using Copilot', () => {
    const leverage = selectCopilotLeverage([
      pullRequest({
        commits: [
          copilotCommit({ commit: 'a', author: 'ada' }),
          humanCommit({ commit: 'b', author: 'grace' })
        ]
      })
    ])

    expect(leverage.adoption).toBe(50)
  })

  test('Should stay neutral on efficiency without a comparable baseline', () => {
    const leverage = selectCopilotLeverage([pullRequest()])

    expect(leverage.efficiency).toBe(50)
    expect(leverage.flowAvailable).toBe(false)
    expect(leverage.flowRatio).toBeNull()
  })

  test('Should reward Copilot-led PRs that finish faster than the manual baseline', () => {
    const payloads = [
      pullRequest({ prNumber: 1, cycleHours: 10 }),
      pullRequest({ prNumber: 2, cycleHours: 10 }),
      pullRequest({
        prNumber: 3,
        cycleHours: 40,
        commits: [humanCommit({ commit: 'h1' })]
      })
    ]

    const leverage = selectCopilotLeverage(payloads)

    expect(leverage.flowAvailable).toBe(true)
    expect(leverage.flowRatio).toBe(4)
    expect(leverage.efficiency).toBe(100)
  })

  test('Should draw the manual baseline from history outside the active window', () => {
    const active = [
      pullRequest({ prNumber: 1, cycleHours: 10 }),
      pullRequest({ prNumber: 2, cycleHours: 10 })
    ]
    const history = [
      ...active,
      pullRequest({
        prNumber: 9,
        cycleHours: 20,
        commits: [humanCommit({ commit: 'h1' })]
      })
    ]

    expect(selectCopilotLeverage(active, history).flowRatio).toBe(2)
    expect(selectCopilotLeverage(active).flowAvailable).toBe(false)
  })

  test('Should fall back to the portfolio baseline for a repository with no manual history', () => {
    const payloads = [
      pullRequest({ prNumber: 1, repository: 'DEFRA/repo-a', cycleHours: 10 }),
      pullRequest({ prNumber: 2, repository: 'DEFRA/repo-a', cycleHours: 10 }),
      pullRequest({
        prNumber: 3,
        repository: 'DEFRA/repo-b',
        cycleHours: 40,
        commits: [humanCommit({ commit: 'h1' })]
      })
    ]

    const repoA = selectCopilotLeverage(payloads).repos.find(
      (repo) => repo.name === 'repo-a'
    )

    expect(repoA.baselineLocal).toBe(false)
    expect(repoA.flowAvailable).toBe(true)
  })

  test('Should rank repositories by leverage', () => {
    const payloads = [
      pullRequest({ prNumber: 1, repository: 'DEFRA/repo-a' }),
      pullRequest({
        prNumber: 2,
        repository: 'DEFRA/repo-b',
        commits: [humanCommit({ commit: 'h1' })]
      })
    ]

    const { repos } = selectCopilotLeverage(payloads)

    expect(repos[0].name).toBe('repo-a')
    expect(repos[1].leveragePct).toBe(0)
  })
})

describe('#selectDeliverySummary', () => {
  const payloads = [
    pullRequest({ prNumber: 1, cycleHours: 10 }),
    pullRequest({ prNumber: 2, cycleHours: 30 })
  ]

  test('Should summarise cycle time across the window', () => {
    const summary = selectDeliverySummary(payloads)

    expect(summary.avgCycleHours).toBe(20)
    expect(summary.medianCycleHours).toBe(20)
    expect(summary.fastestCycleHours).toBe(10)
  })

  test('Should report adoption across contributors', () => {
    const summary = selectDeliverySummary([
      pullRequest({
        commits: [
          copilotCommit({ commit: 'a', author: 'ada' }),
          humanCommit({ commit: 'b', author: 'grace' })
        ]
      })
    ])

    expect(summary.contributorTotal).toBe(2)
    expect(summary.adopters).toBe(1)
    expect(summary.adoptionPct).toBe(50)
  })

  test('Should carry the Copilot leverage breakdown through', () => {
    const summary = selectDeliverySummary(payloads)

    expect(summary.copilotLeverage).toBeGreaterThan(0)
    expect(summary.leverageCoverage).toBe(100)
    expect(summary.leverageAdoption).toBe(100)
  })

  test('Should report net lines from the rework totals', () => {
    const summary = selectDeliverySummary([
      pullRequest({
        commits: [copilotCommit({ linesAdded: 100, linesDeleted: 40 })]
      })
    ])

    expect(summary.linesAdded).toBe(100)
    expect(summary.linesDeleted).toBe(40)
    expect(summary.netLines).toBe(60)
  })

  test('Should zero every figure when there is nothing in the window', () => {
    const summary = selectDeliverySummary([])

    expect(summary.avgCycleHours).toBe(0)
    expect(summary.adoptionPct).toBe(0)
    expect(summary.copilotLeverage).toBe(0)
  })
})

describe('#selectCommitTimeline', () => {
  test('Should order commits by when they were committed', () => {
    const timeline = selectCommitTimeline([
      pullRequest({
        commits: [
          copilotCommit({
            commit: 'late',
            committedAt: '2026-01-12T00:00:00.000Z'
          }),
          copilotCommit({
            commit: 'early',
            committedAt: '2026-01-10T00:00:00.000Z'
          })
        ]
      })
    ])

    expect(timeline.map((commit) => commit.commit)).toEqual(['early', 'late'])
  })

  test('Should attach the repository and PR to each commit', () => {
    const [commit] = selectCommitTimeline([pullRequest({ prNumber: 7 })])

    expect(commit.repoName).toBe('repo-a')
    expect(commit.prNumber).toBe(7)
  })

  test('Should exclude rebase and merge commits', () => {
    const timeline = selectCommitTimeline([
      pullRequest({
        commits: [
          copilotCommit({ commit: 'real', subject: 'Add a chart' }),
          humanCommit({
            commit: 'rebase',
            subject: "Merge branch 'main' into feature/charts"
          })
        ]
      })
    ])

    expect(timeline.map((commit) => commit.commit)).toEqual(['real'])
  })

  test('Should tolerate a payload with no commit breakdown', () => {
    expect(
      selectCommitTimeline([pullRequest({ commitBreakdown: undefined })])
    ).toEqual([])
  })
})

describe('#selectRepoProfiles', () => {
  test('Should return one radar axis per delivery dimension', () => {
    const { indicators } = selectRepoProfiles([pullRequest()])

    expect(indicators.map((indicator) => indicator.name)).toEqual([
      'Commit Assist',
      'Line Assist',
      'Adoption',
      'Delivery Speed',
      'Rework Control'
    ])
  })

  test('Should score a fully assisted repository at the top of both assist axes', () => {
    const [repo] = selectRepoProfiles([pullRequest()]).repos

    expect(repo.values[0]).toBe(100)
    expect(repo.values[1]).toBe(100)
  })

  test('Should score delivery speed against the 48 hour target', () => {
    const [repo] = selectRepoProfiles([pullRequest({ cycleHours: 24 })]).repos

    expect(repo.values[3]).toBe(50)
  })

  test('Should score rework control against the parity target', () => {
    const [repo] = selectRepoProfiles([
      pullRequest({
        commits: [copilotCommit({ linesAdded: 100, linesDeleted: 25 })]
      })
    ]).repos

    expect(repo.values[4]).toBe(75)
  })

  test('Should order repositories by name', () => {
    const { repos } = selectRepoProfiles([
      pullRequest({ prNumber: 1, repository: 'DEFRA/repo-z' }),
      pullRequest({ prNumber: 2, repository: 'DEFRA/repo-a' })
    ])

    expect(repos.map((repo) => repo.name)).toEqual(['repo-a', 'repo-z'])
  })
})

describe('#selectPersonaSummaries', () => {
  test('Should always return one row per persona', () => {
    const empty = selectPersonaSummaries([])

    expect(empty.length).toBeGreaterThan(0)
    expect(empty.every((persona) => persona.prCount === 0)).toBe(true)
  })

  test('Should attribute a repository to exactly one persona', () => {
    const summaries = selectPersonaSummaries([pullRequest()])
    const active = summaries.filter((persona) => persona.prCount > 0)

    expect(active).toHaveLength(1)
    expect(active[0].repoNames).toEqual(['repo-a'])
  })

  test('Should aggregate assist rates for the persona', () => {
    const [active] = selectPersonaSummaries([
      pullRequest({
        commits: [
          copilotCommit({ commit: 'a', author: 'ada' }),
          humanCommit({ commit: 'b', author: 'grace' })
        ]
      })
    ]).filter((persona) => persona.prCount > 0)

    expect(active.copilotAssistedRate).toBe(50)
    expect(active.contributorCount).toBe(2)
    expect(active.adopters).toBe(1)
    expect(active.adoptionPct).toBe(50)
  })

  test('Should average cycle time across the persona', () => {
    const [active] = selectPersonaSummaries([
      pullRequest({ prNumber: 1, cycleHours: 10 }),
      pullRequest({ prNumber: 2, cycleHours: 30 })
    ]).filter((persona) => persona.prCount > 0)

    expect(active.avgCycleHours).toBe(20)
  })

  test('Should attribute a contributor to the persona from the supplied mapping', () => {
    const summaries = selectPersonaSummaries(
      [
        pullRequest({
          commits: [
            copilotCommit({ commit: 'a', author: 'ada' }),
            humanCommit({ commit: 'b', author: 'grace' })
          ]
        })
      ],
      { grace: 'qa' }
    )

    const qa = summaries.find((persona) => persona.id === 'qa')
    const developer = summaries.find((persona) => persona.id === 'developer')

    expect(qa.contributorCount).toBe(1)
    expect(developer.contributorCount).toBe(1)
  })

  test('Should split a single PR across personas when its contributors differ', () => {
    const summaries = selectPersonaSummaries(
      [
        pullRequest({
          commits: [
            copilotCommit({ commit: 'a', author: 'ada' }),
            humanCommit({ commit: 'b', author: 'grace' })
          ]
        })
      ],
      { grace: 'qa' }
    )

    const qa = summaries.find((persona) => persona.id === 'qa')
    const developer = summaries.find((persona) => persona.id === 'developer')

    expect(qa.prCount).toBe(1)
    expect(developer.prCount).toBe(1)
  })
})
