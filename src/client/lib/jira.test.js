import {
  JIRA_KEY_ADD_HINT,
  JIRA_KEY_CHANGE_HINT,
  hasJira,
  jiraKeyEdit,
  jiraKeyOf
} from './jira.js'

describe('#jiraKeyOf', () => {
  test('Should take the first project key', () => {
    expect(jiraKeyOf({ jira: { projectKeys: ['MMOCR', 'FES'] } })).toBe('MMOCR')
  })

  test.each([
    ['no project', undefined],
    ['no jira block', {}],
    ['no keys property', { jira: {} }],
    ['an empty list', { jira: { projectKeys: [] } }],
    ['a blank first key', { jira: { projectKeys: ['  '] } }],
    ['a non-string first key', { jira: { projectKeys: [42] } }],
    ['keys that are not a list', { jira: { projectKeys: null } }]
  ])('Should have no key for %s', (_, project) => {
    expect(jiraKeyOf(project)).toBeNull()
  })
})

describe('#hasJira', () => {
  test('Should be true only when the project has a key', () => {
    expect(hasJira({ jira: { projectKeys: ['MMOCR'] } })).toBe(true)
    expect(hasJira({ jira: { projectKeys: [] } })).toBe(false)
    expect(hasJira(null)).toBe(false)
  })
})

describe('#jiraKeyEdit', () => {
  test.each(['ai-adopted', 'ai-native'])(
    'Should let a stored key of an %s project be changed',
    (type) => {
      expect(
        jiraKeyEdit({ type, jira: { projectKeys: ['MMOCR'] } })
      ).toStrictEqual({
        mode: 'change',
        key: 'MMOCR',
        hint: JIRA_KEY_CHANGE_HINT
      })
    }
  )

  test.each([
    ['an AI-Adopted project', { type: 'ai-adopted' }],
    ['an AI-Native project', { type: 'ai-native' }],
    ['an empty key list', { type: 'ai-adopted', jira: { projectKeys: [] } }]
  ])('Should let %s without a key add one', (_, project) => {
    expect(jiraKeyEdit(project)).toStrictEqual({
      mode: 'add',
      key: null,
      hint: JIRA_KEY_ADD_HINT
    })
  })
})
