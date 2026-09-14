import {
  PERSONAS,
  DEFAULT_PERSONA,
  personaForContributor,
  buildContributorPersonaMap,
  personaMeta
} from './personas.js'

describe('#buildContributorPersonaMap', () => {
  test('Should lower-case handles so lookups are case-insensitive', () => {
    const map = buildContributorPersonaMap([
      { githubHandle: 'JeevanKuduvaRavindran', persona: 'devops' }
    ])

    expect(map.jeevankuduvaravindran).toBe('devops')
  })

  test('Should skip entries with no handle or persona', () => {
    expect(
      buildContributorPersonaMap([{ persona: 'devops' }, { githubHandle: 'x' }])
    ).toEqual({})
  })

  test('Should tolerate no mappings', () => {
    expect(buildContributorPersonaMap()).toEqual({})
  })
})

describe('#personaForContributor', () => {
  const mappings = buildContributorPersonaMap([
    { githubHandle: 'jeevankuduvaravindran', persona: 'devops' },
    { githubHandle: 'sarathk06', persona: 'qa' },
    { githubHandle: 'randhir-patel', persona: 'qa' }
  ])

  test('Should map a GitHub handle to its configured role', () => {
    expect(personaForContributor('jeevankuduvaravindran', mappings)).toBe(
      'devops'
    )
    expect(personaForContributor('sarathk06', mappings)).toBe('qa')
    expect(personaForContributor('randhir-patel', mappings)).toBe('qa')
  })

  test('Should match a handle regardless of case', () => {
    expect(personaForContributor('JeevanKuduvaRavindran', mappings)).toBe(
      'devops'
    )
    expect(personaForContributor('SarathK06', mappings)).toBe('qa')
  })

  test('Should default an unmapped handle to developers', () => {
    expect(personaForContributor('some-other-dev', mappings)).toBe(
      DEFAULT_PERSONA
    )
  })

  test('Should default every handle to developers when no mapping is supplied', () => {
    expect(personaForContributor('jeevankuduvaravindran')).toBe(DEFAULT_PERSONA)
  })

  test.each([undefined, null, 42])(
    'Should default the non-string handle %s to developers',
    (handle) => {
      expect(personaForContributor(handle, mappings)).toBe(DEFAULT_PERSONA)
    }
  )
})

describe('#personaMeta', () => {
  test('Should return the presentation metadata for a persona', () => {
    expect(personaMeta('qa')).toMatchObject({
      id: 'qa',
      label: 'QA Engineers'
    })
  })

  test('Should fall back to the first persona for an unknown id', () => {
    expect(personaMeta('nobody')).toBe(PERSONAS[0])
  })

  test('Should give every persona a label, icon and accent', () => {
    for (const persona of PERSONAS) {
      expect(persona.label).toBeTruthy()
      expect(persona.icon).toBeTruthy()
      expect(persona.accent).toBeTruthy()
    }
  })
})
