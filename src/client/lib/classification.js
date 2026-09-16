/**
 * Detects sync merge / rebase commits from their subject line.
 *
 * The producer now classifies these upstream, structurally, by commit parent
 * count. This regex remains as a fallback for payloads stored before that
 * change, where a sync merge arrives labelled `Human-authored` (see bug
 * FI0-11445: a "Merge branch 'develop' into ..." commit counted as 106
 * human-authored lines). Matching subjects are re-classified as `'Rebase'`
 * and excluded from every rate/rework/leverage/net-lines calculation.
 *
 * Patterns cover the standard git-generated merge/rebase subject lines:
 *   - "Merge branch 'develop' into feature/x"
 *   - "Merge remote-tracking branch 'origin/develop'"
 *   - "Merge pull request #123 from org/branch"
 *   - "Merge tag 'v1.2.3'"
 *   - "Rebase branch 'x' onto 'develop'" / "rebase onto develop"
 */
export const REBASE_MERGE_REGEX =
  /^(merge (branch|remote-tracking branch|pull request|tag)\b|rebase(d)?\b)/i

/**
 * Commit kinds reported for visibility but excluded from every metric.
 */
export const EXCLUDED_CLASSIFICATIONS = ['Rebase', 'Dependabot']

/** Every classification the backend accepts, in the order they are offered. */
export const COMMIT_CLASSIFICATIONS = [
  'Copilot-assisted',
  'Human-authored',
  ...EXCLUDED_CLASSIFICATIONS
]

export function isExcludedClassification(classification) {
  return EXCLUDED_CLASSIFICATIONS.includes(classification)
}

export function isRebaseSubject(subject) {
  return typeof subject === 'string' && REBASE_MERGE_REGEX.test(subject.trim())
}
