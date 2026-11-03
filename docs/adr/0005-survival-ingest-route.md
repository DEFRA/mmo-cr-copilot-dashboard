# 0005. AI code survival ingest route

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The 21-day AI code churn metric needs a measurement made after a pull request merges. A scheduled
GitHub workflow in `mmo-cr-devops-common` computes it from git history and must publish the result
through the dashboard, the only service reachable from GitHub. The analytics workflow's route
(`POST /api/ingest`, [ADR 0003](0003-ingest-authentication-github-oidc.md)) is bound to that
workflow and to pull request events, so it cannot carry a scheduled run.

## Decision

Add `POST /api/ingest/survival`.

- **Authentication:** GitHub Actions OIDC only, verified by the same code as ADR 0003 but with its
  own required `job_workflow_ref` prefix
  (`DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics-survival.yml@`) and its own
  allowed events (`schedule,workflow_dispatch`). There is no shared-secret fallback.
  `INGEST_OIDC_SURVIVAL_WORKFLOW_REF_PREFIX` and `INGEST_OIDC_SURVIVAL_ALLOWED_EVENTS` configure
  them.
- **Separation:** a token from the analytics workflow is rejected here, and a survival token is
  rejected on `/api/ingest`.
- **Checks:** the body must name `kind: ai-survival`, a repository and a pull request number; the
  `repository` claim must equal the payload's repository and the repository must be mapped to a
  project; each token id is used once.
- **Forwarding:** the body is relayed unchanged to the backend `POST /api/survival` with the
  backend ingest token. The backend owns the contract (backend ADR 0007). The size limit is
  256 KB.

## Consequences

- A scheduled workflow can publish without a pull request context.
- Compromising one workflow's token does not let it publish on the other route.
- The dashboard is reachable by two workflow identities; both are pinned to this organisation.

## Alternatives considered

- **Widen the analytics route's workflow and events** — loses the separation between the two
  callers.
- **Publish survival from the analytics workflow** — it only runs for pull requests, and the
  measurement is due 21 days later.
