import { isRebaseSubject, REBASE_MERGE_REGEX } from './classification.js'

describe('#isRebaseSubject', () => {
  test.each([
    "Merge branch 'develop' into feature/charts",
    "Merge remote-tracking branch 'origin/develop'",
    'Merge pull request #123 from DEFRA/feature',
    "Merge tag 'v1.2.3'",
    "Rebase branch 'x' onto 'develop'",
    'rebased onto develop'
  ])('Should recognise the sync commit %s', (subject) => {
    expect(isRebaseSubject(subject)).toBe(true)
  })

  test.each([
    'Add cycle time scatter',
    'Fix merge conflict handling',
    'Emerge from the cave',
    'Merging is hard'
  ])('Should treat the authored commit %s as real work', (subject) => {
    expect(isRebaseSubject(subject)).toBe(false)
  })

  test('Should ignore surrounding whitespace', () => {
    expect(isRebaseSubject("  Merge branch 'develop'  ")).toBe(true)
  })

  test.each([undefined, null, 42, {}])(
    'Should reject the non-string subject %s',
    (subject) => {
      expect(isRebaseSubject(subject)).toBe(false)
    }
  )

  test('Should match case-insensitively', () => {
    expect(REBASE_MERGE_REGEX.test("MERGE BRANCH 'develop'")).toBe(true)
  })
})
