/**
 * Detects sync merge / rebase commits from their subject line. Upstream
 * classification has no way to tell a "catch up with main" merge apart from
 * real authored work, so it defaults these to Human-authored (see the
 * `bugfix/FI0-11445` example: a "Merge branch 'develop' into ..." commit was
 * counted as 106 human-authored lines). Matching subjects are re-classified
 * as `'Rebase'` and excluded from every rate/rework/leverage/net-lines
 * calculation on the dashboard.
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

export function isRebaseSubject(subject) {
  return typeof subject === 'string' && REBASE_MERGE_REGEX.test(subject.trim())
}
