import {
  ONBOARDING_STEPS,
  SETTINGS_TABS,
  fromHash,
  isGlobalLevel,
  toHash
} from './routes.js'

const REPO = 'DEFRA/mmo-cr-pdf'
const PROJECT = 'mmo-catch-recording'

const PROJECT_NAVS = [
  { level: 'overview' },
  { level: 'overview', section: 'repositories' },
  { level: 'repo', repository: REPO },
  { level: 'repoCycle', repository: REPO },
  { level: 'pr', repository: REPO, prNumber: 35 },
  { level: 'contributor', contributor: 'ada lovelace' },
  { level: 'contributor', contributor: 'ada', repository: REPO },
  { level: 'pullRequests' },
  { level: 'contributors' },
  { level: 'delivery' },
  { level: 'leverage' },
  { level: 'copilotUsage' },
  { level: 'ticket', ticket: 'MMO-12' }
]

const GLOBAL_NAVS = [
  { level: 'settings' },
  ...SETTINGS_TABS.map((tab) => ({ level: 'settings', tab })),
  { level: 'onboarding' },
  ...ONBOARDING_STEPS.map((step) => ({ level: 'onboarding', step })),
  { level: 'help' },
  { level: 'adminProjects' },
  { level: 'accessibility' },
  { level: 'cookies' },
  { level: 'privacy' }
]

describe('#toHash', () => {
  test.each([
    [{ level: 'overview' }, '#/overview'],
    [{ level: 'overview', section: 'repositories' }, '#/overview/repositories'],
    [{ level: 'repo', repository: REPO }, '#/repository/DEFRA%2Fmmo-cr-pdf'],
    [
      { level: 'repoCycle', repository: REPO },
      '#/repository/DEFRA%2Fmmo-cr-pdf/cycle-time'
    ],
    [
      { level: 'pr', repository: REPO, prNumber: 35, project: PROJECT },
      '#/projects/mmo-catch-recording/repository/DEFRA%2Fmmo-cr-pdf/pull/35'
    ],
    [
      { level: 'contributor', contributor: 'ada', repository: REPO },
      '#/repository/DEFRA%2Fmmo-cr-pdf/contributor/ada'
    ],
    [{ level: 'pullRequests' }, '#/pull-requests'],
    [
      { level: 'copilotUsage', project: 'my-project' },
      '#/projects/my-project/copilot-usage'
    ],
    [
      { level: 'ticket', ticket: 'MMO-12', project: PROJECT },
      '#/projects/mmo-catch-recording/ticket/MMO-12'
    ],
    [{ level: 'adminProjects', project: PROJECT }, '#/admin/projects'],
    [{ level: 'settings' }, '#/settings'],
    [{ level: 'settings', tab: 'audit-log' }, '#/settings/audit-log'],
    [{ level: 'settings', tab: 'nowhere' }, '#/settings'],
    [{ level: 'onboarding' }, '#/onboarding'],
    [{ level: 'onboarding', step: 'check' }, '#/onboarding/check'],
    [{ level: 'onboarding', step: 'personas' }, '#/onboarding'],
    [{ level: 'help', project: PROJECT }, '#/help'],
    [{ level: 'help', tab: 'personas' }, '#/help']
  ])('Should build the hash for %o', (nav, hash) => {
    expect(toHash(nav)).toBe(hash)
  })
})

describe('#fromHash', () => {
  test('Should treat a malformed ticket key as the overview', () => {
    expect(fromHash('#/ticket/not a key')).toStrictEqual({ level: 'overview' })
  })
  test.each([...PROJECT_NAVS, ...GLOBAL_NAVS])(
    'Should round-trip %o without a project',
    (nav) => {
      expect(fromHash(toHash(nav))).toStrictEqual(nav)
    }
  )

  test.each(PROJECT_NAVS)('Should round-trip %o with a project', (nav) => {
    const scoped = { ...nav, project: PROJECT }
    expect(fromHash(toHash(scoped))).toStrictEqual(scoped)
  })

  test('Should decode a fully percent-encoded hash', () => {
    expect(fromHash('#%2Frepository%2FDEFRA%252Fmmo-cr-pdf')).toStrictEqual({
      level: 'repo',
      repository: REPO
    })
    expect(fromHash('#%2Foverview')).toStrictEqual({ level: 'overview' })
  })

  test.each([
    ['#settings', { level: 'settings' }],
    ['#accessibility', { level: 'accessibility' }],
    ['#admin/projects', { level: 'adminProjects' }],
    ['#overview', { level: 'overview' }],
    ['', { level: 'overview' }]
  ])('Should accept the legacy hash %s', (hash, nav) => {
    expect(fromHash(hash)).toStrictEqual(nav)
  })

  test.each([
    ['#/settings/roles', { level: 'settings', tab: 'roles' }],
    [
      '#/onboarding/confirmation',
      { level: 'onboarding', step: 'confirmation' }
    ],
    ['#/settings/unknown', { level: 'settings' }],
    ['#/onboarding/unknown', { level: 'onboarding' }],
    ['#/settings/personas/extra', { level: 'settings' }],
    ['#/help', { level: 'help' }],
    ['#/help/extra', { level: 'overview' }]
  ])('Should parse the sub page hash %s', (hash, nav) => {
    expect(fromHash(hash)).toStrictEqual(nav)
  })

  test.each([
    '#/nowhere',
    '#/repository',
    '#/repository/a/pull/0',
    '#/repository/a/pull/abc',
    '#/repository/a/extra/b/c',
    '#/overview/unknown',
    '#/%E0%A4%A'
  ])('Should fall back to the overview for %s', (hash) => {
    expect(fromHash(hash)).toStrictEqual({ level: 'overview' })
  })

  test('Should keep the project on an unknown project path', () => {
    expect(fromHash('#/projects/p1/nowhere')).toStrictEqual({
      level: 'overview',
      project: 'p1'
    })
  })
})

describe('#isGlobalLevel', () => {
  test('Should tell global pages from project pages', () => {
    expect(isGlobalLevel('settings')).toBe(true)
    expect(isGlobalLevel('repo')).toBe(false)
  })
})
