import {
  JIRA_KEY_ADD_ONCE,
  JIRA_KEY_FIXED,
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
  test('Should fix a stored key', () => {
    expect(
      jiraKeyEdit({ type: 'ai-adopted', jira: { projectKeys: ['MMOCR'] } })
    ).toStrictEqual({ mode: 'fixed', key: 'MMOCR', hint: JIRA_KEY_FIXED })
  })

  test('Should fix the key of an AI-Native project', () => {
    expect(
      jiraKeyEdit({ type: 'ai-native', jira: { projectKeys: ['MMOCR'] } }).mode
    ).toBe('fixed')
    expect(jiraKeyEdit({ type: 'ai-native' })).toStrictEqual({
      mode: 'fixed',
      key: null,
      hint: JIRA_KEY_FIXED
    })
  })

  test('Should let a key-less AI-Adopted project add one once', () => {
    expect(jiraKeyEdit({ type: 'ai-adopted' })).toStrictEqual({
      mode: 'add',
      key: null,
      hint: JIRA_KEY_ADD_ONCE
    })
    expect(
      jiraKeyEdit({ type: 'ai-adopted', jira: { projectKeys: [] } }).mode
    ).toBe('add')
  })
})
