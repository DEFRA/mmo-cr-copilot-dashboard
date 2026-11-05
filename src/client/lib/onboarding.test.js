import {
  EMPTY_DETAILS,
  EMPTY_REPOSITORIES,
  JIRA_KEY_PATTERN,
  REPOSITORY_PATTERN,
  SLUG_PATTERN,
  SONAR_KEY_PATTERN,
  formatDate,
  isRepositoryName,
  parseDate,
  splitKeys,
  toProjectRequest,
  toRepositoryMappings,
  typeLabel,
  validateProject,
  validateRepositories
} from './onboarding.js'

const NOW = new Date('2026-06-15T12:00:00Z')

const details = (overrides = {}) => ({
  ...EMPTY_DETAILS,
  name: 'Catch Recording',
  slug: 'CRAR',
  type: 'ai-adopted',
  adoption: { day: '1', month: '10', year: '2025' },
  jiraKeys: 'MMOCR, FES',
  ...overrides
})

const row = (fullName = '', sonarProjectKey = '') => ({
  fullName,
  sonarProjectKey
})

describe('#patterns', () => {
  test.each([
    [SLUG_PATTERN, 'CRAR', true],
    [SLUG_PATTERN, 'A1B', true],
    [SLUG_PATTERN, 'crar', false],
    [SLUG_PATTERN, '1ABC', false],
    [SLUG_PATTERN, 'ABCDE', false],
    [JIRA_KEY_PATTERN, 'MMO_CR', true],
    [JIRA_KEY_PATTERN, 'mmo', false],
    [REPOSITORY_PATTERN, 'DEFRA/mmo-cr-pdf', true],
    [REPOSITORY_PATTERN, 'no-owner', false],
    [REPOSITORY_PATTERN, 'a/b/c', false],
    [SONAR_KEY_PATTERN, 'DEFRA_mmo-cr.pdf:main', true],
    [SONAR_KEY_PATTERN, 'has space', false]
  ])('Should test %s against %s as %s', (pattern, value, expected) => {
    expect(pattern.test(value)).toBe(expected)
  })
})

describe('#empty values', () => {
  test('Should start with no details and one blank repository row', () => {
    expect(EMPTY_DETAILS.name).toBe('')
    expect(EMPTY_DETAILS.adoption).toStrictEqual({
      day: '',
      month: '',
      year: ''
    })
    expect(EMPTY_REPOSITORIES).toStrictEqual([row()])
  })
})

describe('#splitKeys', () => {
  test('Should trim and drop empty entries', () => {
    expect(splitKeys(' MMOCR , ,FES,')).toStrictEqual(['MMOCR', 'FES'])
    expect(splitKeys('')).toStrictEqual([])
  })
})

describe('#parseDate', () => {
  test('Should return a UTC date for a real date', () => {
    expect(
      parseDate({ day: '1', month: '10', year: '2025' }).toISOString()
    ).toBe('2025-10-01T00:00:00.000Z')
  })

  test.each([
    [{ day: '31', month: '2', year: '2025' }],
    [{ day: 'x', month: '2', year: '2025' }],
    [{ day: '1', month: '', year: '2025' }],
    [{ day: '1', month: '2', year: '25' }],
    [{ day: '1.5', month: '2', year: '2025' }],
    [{ day: '', month: '', year: '' }]
  ])('Should reject %o', (value) => {
    expect(parseDate(value)).toBeNull()
  })
})

describe('#isRepositoryName', () => {
  test.each([
    ['DEFRA/mmo-cr-pdf', true],
    ['just-a-name', false],
    ['', false],
    [undefined, false],
    [42, false]
  ])('Should answer %s as %s', (value, expected) => {
    expect(isRepositoryName(value)).toBe(expected)
  })
})

describe('#typeLabel', () => {
  test('Should label each project type', () => {
    expect(typeLabel('ai-native')).toBe('AI-native')
    expect(typeLabel('ai-adopted')).toBe('AI-adopted')
  })
})

describe('#formatDate', () => {
  test('Should format an ISO date in British English', () => {
    expect(formatDate('2025-10-01T00:00:00.000Z')).toBe('1 October 2025')
  })

  test('Should say when there is no date', () => {
    expect(formatDate(undefined)).toBe('Not set')
  })
})

describe('#validateProject', () => {
  test('Should accept complete details', () => {
    expect(validateProject(details(), NOW)).toStrictEqual({})
  })

  test('Should flag every missing answer', () => {
    expect(
      Object.keys(validateProject({ ...EMPTY_DETAILS }, NOW)).sort()
    ).toStrictEqual(['name', 'slug', 'type'])
  })

  test('Should limit the name to 80 characters', () => {
    expect(validateProject(details({ name: 'x'.repeat(81) }), NOW).name).toBe(
      'Project name must be 80 characters or fewer'
    )
  })

  test('Should reject a malformed slug', () => {
    expect(validateProject(details({ slug: 'crar' }), NOW).slug).toMatch(
      /3 or 4 capital letters/
    )
  })

  test('Should need an adoption date for an AI-adopted project only', () => {
    const blank = { day: '', month: '', year: '' }
    expect(validateProject(details({ adoption: blank }), NOW).adoption).toBe(
      'Enter the date the team adopted Copilot'
    )
    expect(
      validateProject(details({ type: 'ai-native', adoption: blank }), NOW)
    ).toStrictEqual({})
  })

  test('Should reject an unreal or future adoption date', () => {
    expect(
      validateProject(
        details({ adoption: { day: '31', month: '2', year: '2025' } }),
        NOW
      ).adoption
    ).toBe('Adoption start date must be a real date')
    expect(
      validateProject(
        details({ adoption: { day: '16', month: '6', year: '2026' } }),
        NOW
      ).adoption
    ).toBe('Adoption start date must be today or in the past')
  })

  test('Should reject a malformed Jira key but allow none', () => {
    expect(validateProject(details({ jiraKeys: 'mmo' }), NOW).jiraKeys).toMatch(
      /capital letters/
    )
    expect(validateProject(details({ jiraKeys: '' }), NOW)).toStrictEqual({})
  })

  test('Should default the clock to now', () => {
    expect(
      validateProject(
        details({ adoption: { day: '1', month: '1', year: '2999' } })
      ).adoption
    ).toBe('Adoption start date must be today or in the past')
  })
})

describe('#validateRepositories', () => {
  test('Should accept named repositories with optional Sonar keys', () => {
    expect(
      validateRepositories([
        row('DEFRA/one', 'DEFRA_one'),
        row('DEFRA/two'),
        row()
      ])
    ).toStrictEqual({})
  })

  test('Should need at least one repository', () => {
    expect(validateRepositories([row(), row()])).toStrictEqual({
      list: 'Add at least one repository'
    })
    expect(validateRepositories([])).toStrictEqual({
      list: 'Add at least one repository'
    })
  })

  test('Should flag a name that is not owner/name', () => {
    expect(validateRepositories([row('DEFRA/one'), row('nope')])).toStrictEqual(
      {
        rows: {
          1: {
            fullName:
              'Enter the repository as owner/name, like DEFRA/mmo-cr-pdf'
          }
        }
      }
    )
  })

  test('Should flag an already mapped repository ignoring case', () => {
    expect(
      validateRepositories([row('defra/Mapped')], ['DEFRA/mapped']).rows[0]
        .fullName
    ).toBe('defra/Mapped is already mapped to a project')
  })

  test('Should flag a repository listed twice', () => {
    expect(
      validateRepositories([row('DEFRA/one'), row('defra/one')]).rows
    ).toStrictEqual({ 1: { fullName: 'defra/one is listed more than once' } })
  })

  test('Should flag a Sonar key with no repository', () => {
    expect(
      validateRepositories([row('DEFRA/one'), row('', 'KEY')]).rows[1]
    ).toStrictEqual({
      fullName: 'Enter the repository this Sonar project key is for'
    })
  })

  test('Should flag a malformed Sonar key', () => {
    expect(
      validateRepositories([row('DEFRA/one', 'bad key')]).rows[0]
        .sonarProjectKey
    ).toMatch(/letters, numbers/)
  })
})

describe('#toProjectRequest', () => {
  test('Should build the request with an ISO adoption date', () => {
    expect(
      toProjectRequest(details({ name: '  Catch Recording ' }))
    ).toStrictEqual({
      name: 'Catch Recording',
      slug: 'CRAR',
      type: 'ai-adopted',
      adoptionStartDate: '2025-10-01T00:00:00.000Z',
      jira: { projectKeys: ['MMOCR', 'FES'] }
    })
  })

  test('Should leave out an adoption date that was not given', () => {
    const request = toProjectRequest(
      details({
        type: 'ai-native',
        adoption: EMPTY_DETAILS.adoption,
        jiraKeys: ''
      })
    )

    expect(request).not.toHaveProperty('adoptionStartDate')
    expect(request.jira).toStrictEqual({ projectKeys: [] })
  })
})

describe('#toRepositoryMappings', () => {
  test('Should build a body per named repository and skip blank rows', () => {
    expect(
      toRepositoryMappings('CRAR', [
        row(' DEFRA/one ', ' DEFRA_one '),
        row('DEFRA/two'),
        row()
      ])
    ).toStrictEqual([
      {
        fullName: 'DEFRA/one',
        body: { projectSlug: 'CRAR', sonarProjectKey: 'DEFRA_one' }
      },
      { fullName: 'DEFRA/two', body: { projectSlug: 'CRAR' } }
    ])
  })
})
