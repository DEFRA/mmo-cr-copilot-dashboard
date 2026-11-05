# Architecture decision records

An architecture decision record (ADR) captures one significant decision: the context, what was
decided, and the consequences. ADRs are written before the change that depends on them and are never
rewritten once accepted — a later decision supersedes them instead.

Decisions owned by the backend (payload contract, data model, Jira, complexity model) live in
`docs/adr/` in `mmo-cr-copilot-backend`. Metric definitions live in [docs/metrics.md](../metrics.md).

## Lifecycle

- **Proposed** — drafted for discussion; the direction may still change.
- **Accepted** — agreed; code and instruction files follow it.
- **Superseded** — replaced by a later ADR, which is linked from the status line.
- **Deprecated** — no longer applies and has no replacement.

## Writing an ADR

- Copy [0000-template.md](0000-template.md) to `NNNN-kebab-title.md`, using the next free
  four-digit number. Numbers are never reused.
- Keep it short. Link to sources rather than repeating them.
- Add it to the index below in the same change.

Any deviation from a [DEFRA software development standard](https://defra.github.io/software-development-standards/)
must be raised as a formal exception with DEFRA Delivery Architecture
(delivery.architecture@defra.gov.uk) and recorded in the ADR.

## Index

| ADR                                                                      | Title                                                         | Status                              |
| :----------------------------------------------------------------------- | :------------------------------------------------------------ | :---------------------------------- |
| [0001](0001-adopt-govuk-frontend.md)                                     | Adopt GOV.UK Frontend and MOJ Frontend                        | Accepted                            |
| [0002](0002-entra-id-authentication.md)                                  | Microsoft Entra ID authentication                             | Accepted, partly superseded by 0006 |
| [0003](0003-ingest-authentication-github-oidc.md)                        | Ingest authentication with GitHub Actions OIDC                | Accepted                            |
| [0004](0004-vscode-attribution-capture.md)                               | VS Code AI attribution capture                                | Proposed                            |
| [0005](0005-survival-ingest-route.md)                                    | AI code survival ingest route                                 | Accepted                            |
| [0006](0006-bearer-only-backend-calls-token-refresh-db-role-mappings.md) | Bearer-only backend calls, token refresh and DB role mappings | Accepted                            |
