# 0004. VS Code AI attribution capture

- **Status:** Proposed — stays Proposed until the E8-S1 spike reports (decision D17;
  B9 is deferred to after the prototype). Nothing in the prototype depends on it.
- **Date:** 2026-10-15

## Context

A commit is classed as Copilot-assisted today when its message contains `Copilot-Assisted: true`,
and every line of that commit then counts as assisted. The dashboard needs, as accurately as
possible, which lines came from GitHub Copilot (completions, chat, agent) and which were typed or
pasted by a person.

Findings that shape the decision:

- No stable VS Code API reports that a change came from Copilot; `TextDocumentChangeEvent.reason`
  only distinguishes undo and redo. Attribution must be assembled from signals.
- VS Code agent hooks (`PostToolUse`) report tool calls that edit files. Hooks are in preview and
  enterprise policy can disable them.
- Git AI is an open standard that stores line-level AI attribution in git notes and survives rebase,
  squash, amend and cherry-pick.
- GitHub's Copilot usage metrics give organisation-level daily line counts by feature, useful for
  calibration but not per commit.

This decision belongs to a new extension repository. It is recorded here until that repository
exists, because the dashboard consumes its output.

## Decision

**Proposed — to be confirmed in E8-S1.**

- Keep the attribution ledger inside `.git/` (for example `.git/copilot-attribution/ledger.json`), so
  it is never tracked or committed. It holds file, line ranges, content hash, origin and timestamps —
  **no code content**.
- Capture signals:
  - **Completions** — a `Tab` keybinding, when an inline suggestion is visible, that records the
    acceptance and then runs `editor.action.inlineSuggest.commit`.
  - **Agent and chat edits** — agent hooks (`PostToolUse`), with heuristics when hooks are disabled.
  - **Paste** — wrap the paste command or compare inserted text to the clipboard.
  - **Typing** — single-character and IME changes in the active editor.
- A `prepare-commit-msg` hook writes a deterministic trailer from the **staged** diff and the ledger,
  for example
  `Copilot-Attribution: v=1; ai-completion=42; ai-chat=10; ai-agent=120; pasted=6; typed=31; id=4f9c2a`.
- **Per-commit consumption:** after a commit, verify the trailer is on `HEAD`, then remove only the
  committed entries; reset fully only when the working tree is clean.
- Align the format with the Git AI open standard.
- The legacy `Copilot-Assisted: true` trailer stays readable.

## Consequences

- Line-level AI share becomes possible, labelled by data source in the dashboard.
- The payload contract v2 `attribution` block (backend ADR 0001) carries the counts.
- Accuracy depends on preview APIs and heuristics; an accuracy harness is needed.
- Developers must install the extension and git hooks.

## Alternatives considered

- **A metadata file in the working tree** — shows as a change and can be committed by accident.
- **Copilot commit-message instructions write the summary** — non-deterministic and skipped by manual
  and CLI commits; kept as a secondary path only.
- **Reset the ledger on push** — mis-attributes partial staging and several commits before a push.

## Open points

- Build our own extension, or adopt or align with Git AI. Git AI's governance is a consideration.
- DEFRA policy on installing extensions and git hooks on developer machines.
- Whether commits made outside VS Code (terminal, other IDEs) must be covered.
- Packaging, signing and publisher.

Resolved by backend ADR 0005 §4 (D16): AI line share is collected for AI-Native projects but
feeds only AI code durability, never an adoption metric.

## References

- VS Code API — https://code.visualstudio.com/api/references/vscode-api
- VS Code agent hooks — https://code.visualstudio.com/docs/copilot/customization/hooks
- Git AI — https://github.com/git-ai-project/git-ai
- Git hooks — https://git-scm.com/docs/githooks
- Git trailers — https://git-scm.com/docs/git-interpret-trailers
- GitHub Copilot usage metrics —
  https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics
