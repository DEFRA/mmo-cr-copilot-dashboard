import {
  EMPTY_DETAILS,
  JIRA_KEY_PATTERN,
  REPOSITORY_PATTERN,
  SLUG_PATTERN,
  addRepository,
  adoptionDateError,
  formatDate,
  isRepositoryName,
  jiraKeyError,
  jiraKeyField,
  jiraKeyRequired,
  parseDate,
  toDateParts,
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
  jiraKey: 'MMOCR',
  ...overrides
})

describe('#patterns', () => {
  test.each([
    [SLUG_PATTERN, 'CRAR', true],
    [SLUG_PATTERN, 'ABC', true],
    [SLUG_PATTERN, 'A1B', false],
    [SLUG_PATTERN, 'crar', false],
    [SLUG_PATTERN, 'AB', false],
    [SLUG_PATTERN, 'ABCDE', false],
    [JIRA_KEY_PATTERN, 'MMO_CR', true],
    [JIRA_KEY_PATTERN, 'FI0', true],
    [JIRA_KEY_PATTERN, '0FI', false],
    [JIRA_KEY_PATTERN, 'mmo', false],
    [REPOSITORY_PATTERN, 'DEFRA/mmo-cr-pdf', true],
    [REPOSITORY_PATTERN, 'no-owner', false],
    [REPOSITORY_PATTERN, 'a/b/c', false]
  ])('Should test %s against %s as %s', (pattern, value, expected) => {
    expect(pattern.test(value)).toBe(expected)
  })
})

describe('#empty values', () => {
  test('Should start with no details and one empty Jira key', () => {
    expect(EMPTY_DETAILS.name).toBe('')
    expect(EMPTY_DETAILS.jiraKey).toBe('')
    expect(EMPTY_DETAILS.adoption).toStrictEqual({
      day: '',
      month: '',
      year: ''
    })
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
    expect(typeLabel('ai-native')).toBe('AI-Native')
    expect(typeLabel('ai-adopted')).toBe('AI-Adopted')
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

describe('#toDateParts', () => {
  test('Should split an ISO date into UTC day, month and year', () => {
    expect(toDateParts('2026-06-01T00:00:00.000Z')).toStrictEqual({
      day: '1',
      month: '6',
      year: '2026'
    })
  })

  test('Should give empty parts when there is no date', () => {
    expect(toDateParts(null)).toStrictEqual({ day: '', month: '', year: '' })
  })
})

describe('#adoptionDateError', () => {
  const EMPTY = { day: '', month: '', year: '' }

  test.each([
    [EMPTY, true, 'Enter the date the team adopted Copilot'],
    [EMPTY, false, null],
    [
      { day: '31', month: '2', year: '2026' },
      true,
      'Adoption start date must be a real date'
    ],
    [
      { day: '16', month: '6', year: '2026' },
      true,
      'Adoption start date must be today or in the past'
    ],
    [{ day: '1', month: '6', year: '2026' }, true, null]
  ])('Should answer %o (required %s) with %s', (value, required, expected) => {
    expect(adoptionDateError(value, required, NOW)).toBe(expected)
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

  test('Should reject a slug that is not 3 or 4 letters', () => {
    expect(validateProject(details({ slug: 'AB' }), NOW).slug).toBe(
      'Slug must be 3 to 4 letters'
    )
    expect(validateProject(details({ slug: 'ABCDE' }), NOW).slug).toBe(
      'Slug must be 3 to 4 letters'
    )
  })

  test('Should reject a slug with digits or other characters', () => {
    for (const slug of ['AB1C', 'A1B', '1234', 'AB C', 'AB-C']) {
      expect(validateProject(details({ slug }), NOW).slug).toBe(
        'Slug must only contain letters, no numbers'
      )
    }
  })

  test('Should accept a lower case slug as it is upper-cased on submit', () => {
    expect(validateProject(details({ slug: 'crar' }), NOW)).toStrictEqual({})
  })

  test('Should never tell the user to use capital letters', () => {
    const messages = [
      validateProject(details({ slug: 'a' }), NOW).slug,
      validateProject(details({ slug: 'a1' }), NOW).slug,
      validateProject(details({ jiraKey: '1a' }), NOW).jiraKey,
      validateProject(details({ jiraKey: 'a,b' }), NOW).jiraKey
    ]

    for (const message of messages) {
      expect(message).not.toMatch(/capital/i)
    }
  })

  test('Should need an adoption date for an AI-Adopted project only', () => {
    const blank = { day: '', month: '', year: '' }
    expect(validateProject(details({ adoption: blank }), NOW).adoption).toBe(
      'Enter the date the team adopted Copilot'
    )
    expect(
      validateProject(
        details({ type: 'ai-native', adoption: blank, jiraKey: 'MMOCR' }),
        NOW
      )
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

  test('Should allow no Jira key and accept one in any case', () => {
    expect(validateProject(details({ jiraKey: '' }), NOW)).toStrictEqual({})
    expect(validateProject(details({ jiraKey: 'mmo_cr' }), NOW)).toStrictEqual(
      {}
    )
    expect(validateProject(details({ jiraKey: ' MMOCR ' }), NOW)).toStrictEqual(
      {}
    )
  })

  test.each(['MMOCR,FES', 'MMOCR, FES', 'MMOCR FES', 'MMOCR,'])(
    'Should reject %j as more than one Jira key',
    (jiraKey) => {
      expect(validateProject(details({ jiraKey }), NOW).jiraKey).toBe(
        'Enter one Jira project key, with no commas or spaces, like MMOCR'
      )
    }
  )

  test('Should need a Jira key for an AI-Native project only', () => {
    const native = { type: 'ai-native', adoption: EMPTY_DETAILS.adoption }
    expect(
      validateProject(details({ ...native, jiraKey: '  ' }), NOW).jiraKey
    ).toBe('Enter a Jira project key')
    expect(
      validateProject(details({ ...native, jiraKey: 'mmocr' }), NOW)
    ).toStrictEqual({})
    expect(
      validateProject(details({ jiraKey: '' }), NOW).jiraKey
    ).toBeUndefined()
  })

  test('Should reject a malformed Jira key', () => {
    expect(validateProject(details({ jiraKey: '1MMO' }), NOW).jiraKey).toMatch(
      /must start with a letter/
    )
    expect(validateProject(details({ jiraKey: 'M' }), NOW).jiraKey).toMatch(
      /must start with a letter/
    )
  })

  test('Should default the clock to now', () => {
    expect(
      validateProject(
        details({ adoption: { day: '1', month: '1', year: '2999' } })
      ).adoption
    ).toBe('Adoption start date must be today or in the past')
  })
})

describe('#jiraKeyField', () => {
  test('Should require the key only for an AI-Native project', () => {
    expect(jiraKeyRequired('ai-native')).toBe(true)
    expect(jiraKeyRequired('ai-adopted')).toBe(false)
    expect(jiraKeyRequired('')).toBe(false)
  })

  test('Should label the field by project type', () => {
    expect(jiraKeyField('ai-native').label).toBe('Jira project key')
    expect(jiraKeyField('ai-native').hint).toMatch(/Required for an AI-Native/)
    expect(jiraKeyField('ai-adopted').label).toBe('Jira project key (optional)')
    expect(jiraKeyField('').label).toBe('Jira project key (optional)')
  })
})

describe('#addRepository', () => {
  test('Should add a valid repository, trimmed', () => {
    expect(addRepository(['DEFRA/one'], ' DEFRA/two ')).toStrictEqual({
      list: ['DEFRA/one', 'DEFRA/two'],
      name: 'DEFRA/two'
    })
  })

  test('Should refuse a name that is not owner/name', () => {
    expect(addRepository(['DEFRA/one'], 'nope')).toStrictEqual({
      list: ['DEFRA/one'],
      name: 'nope',
      error: 'Enter the repository as owner/name, like DEFRA/mmo-cr-pdf'
    })
    expect(addRepository([], '   ').error).toMatch(/owner\/name/)
  })

  test('Should refuse an already mapped repository ignoring case', () => {
    expect(addRepository([], 'defra/Mapped', ['DEFRA/mapped']).error).toBe(
      'defra/Mapped is already mapped to a project'
    )
  })

  test('Should ignore a repository already added ignoring case', () => {
    expect(addRepository(['DEFRA/one'], 'defra/ONE')).toStrictEqual({
      list: ['DEFRA/one'],
      name: 'defra/ONE',
      duplicate: true
    })
  })
})

describe('#validateRepositories', () => {
  test('Should accept added repositories', () => {
    expect(validateRepositories(['DEFRA/one', 'DEFRA/two'])).toStrictEqual({})
  })

  test('Should need at least one repository', () => {
    expect(validateRepositories([])).toStrictEqual({
      list: 'Add at least one repository'
    })
  })

  test('Should flag an already mapped repository ignoring case', () => {
    expect(
      validateRepositories(['DEFRA/one', 'defra/Mapped'], ['DEFRA/mapped'])
    ).toStrictEqual({ list: 'defra/Mapped is already mapped to a project' })
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
      jira: { projectKeys: ['MMOCR'] }
    })
  })

  test('Should upper-case the slug and the Jira key', () => {
    const request = toProjectRequest(
      details({ slug: 'crar', jiraKey: ' mmocr ' })
    )

    expect(request.slug).toBe('CRAR')
    expect(request.jira).toStrictEqual({ projectKeys: ['MMOCR'] })
  })

  test('Should leave out an adoption date that was not given', () => {
    const request = toProjectRequest(
      details({
        type: 'ai-native',
        adoption: EMPTY_DETAILS.adoption,
        jiraKey: ''
      })
    )

    expect(request).not.toHaveProperty('adoptionStartDate')
    expect(request.jira).toStrictEqual({ projectKeys: [] })
  })
})

describe('#toRepositoryMappings', () => {
  test('Should build a body with only the project slug per repository', () => {
    expect(
      toRepositoryMappings('CRAR', ['DEFRA/one', 'DEFRA/two'])
    ).toStrictEqual([
      { fullName: 'DEFRA/one', body: { projectSlug: 'CRAR' } },
      { fullName: 'DEFRA/two', body: { projectSlug: 'CRAR' } }
    ])
  })
})

describe('#jiraKeyError', () => {
  test.each([
    ['', false, null],
    ['MMOCR', true, null],
    ['', true, 'Enter a Jira project key'],
    ['A,B', false, expect.stringContaining('no commas or spaces')],
    ['A B', true, expect.stringContaining('no commas or spaces')],
    ['1A', false, expect.stringContaining('must start with a letter')]
  ])('Should check %j (required: %s)', (key, required, expected) => {
    expect(jiraKeyError(key, required)).toStrictEqual(expected)
  })
})
