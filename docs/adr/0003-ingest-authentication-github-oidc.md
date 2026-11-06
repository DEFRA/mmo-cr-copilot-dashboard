# 0003. Ingest authentication with GitHub Actions OIDC

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

`POST /api/ingest` accepts analytics payloads from the shared GitHub Actions workflow and forwards
them to the backend. It is authenticated by a single shared `INGEST_TOKEN`: any holder can post a
payload for any repository, and the secret must be rotated in every caller.

With many projects, one project must not be able to post data for another project's repository.

GitHub Actions can issue a short-lived OpenID Connect token for a job with `id-token: write`. GitHub
signs it with RS256, and its claims describe the run: `repository`, `repository_id`,
`repository_owner_id`, `job_workflow_ref`, `event_name`, `ref`, `sha` and `run_id`. Pull requests
from forks do not receive a token.

**Decided:** ingest is authenticated with GitHub Actions OIDC tokens, verified by this service.

## Decision

**Accepted (E2-S7, October 2026).**

The reusable workflow requests a token with a dashboard-specific audience and sends it as
`Authorization: Bearer <token>`. The BFF verifies, in order:

1. **Signature** — keys from the `jwks_uri` in GitHub's OIDC discovery document
   (`https://token.actions.githubusercontent.com/.well-known/openid-configuration`), fetched through
   the CDP proxy, cached, and refreshed when an unknown `kid` appears. Only `RS256` is accepted.
2. **Standard claims** — `iss` equals `https://token.actions.githubusercontent.com`; `aud` equals
   our audience; `exp`, `nbf` and `iat` are checked with a small clock tolerance.
3. **Caller** — `repository_owner_id` is the DEFRA organisation's numeric ID; `job_workflow_ref`
   starts with `DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics.yml@`; `event_name`
   is in an allow-list.
4. **Payload** — `repository` and `repository_id` match the payload's repository, and the repository
   is mapped to a project.
5. **Replay** — each `jti` is stored until its `exp`, and reuse is rejected.

The shared `INGEST_TOKEN` is retired once every caller has migrated.

## Consequences

- No shared ingest secret to store or rotate.
- New egress to `token.actions.githubusercontent.com`, per environment.
- A `jti` store is needed, shared across instances.
- Tests cover a valid token, wrong audience, wrong issuer, expired token, unknown key, mismatched
  repository, wrong workflow ref and replayed `jti`.
- A transition period accepts both mechanisms.

## Alternatives considered

- **Keep the shared token** — no per-repository binding.
- **A token per project** — still a secret to store and rotate in each repository.
- **GitHub App installation tokens** — more moving parts and a private key to manage.

## Open points

Resolved (B2.5):

- **Audience:** `mmo-cr-copilot-dashboard` (`INGEST_OIDC_AUDIENCE`).
- **Organisation ID:** `5528822`, set once for every environment in `cdp-app-config`
  (`services/mmo-cr-copilot-dashboard/defaults.env`) as `INGEST_OIDC_OWNER_ID`; OIDC ingest is
  refused while it is empty.
- **Events:** `pull_request,workflow_dispatch` (`INGEST_OIDC_ALLOWED_EVENTS`).
- **Workflow ref:** any ref after the `@` is accepted, so callers may pin a tag or SHA
  (`INGEST_OIDC_WORKFLOW_REF_PREFIX`). The setting is a comma-separated list; its default accepts
  `copilot-analytics.yml` and `copilot-analytics-backfill.yml`, whose tokens otherwise failed this
  check. The survival workflow is not in the list; it has its own route (ADR 0005).
- **`jti` store:** the session Catbox cache (Redis in CDP), segment `ingest-jti`, kept until
  `exp`. The publish script asks for a fresh token on every retry.
- **Unmapped repositories:** rejected with 403. Repositories are mapped in the admin screen before
  the caller workflow is added (onboarding runbook).
- **Library:** `jose` (`createRemoteJWKSet`, `jwtVerify`), shared with Entra sign-in (ADR 0002).

Still open:

- None. The shared token is no longer used by GitHub workflows: `INGEST_ALLOW_SHARED_TOKEN` now
  defaults to `false` and remains only as a break-glass switch (for example the one-off legacy
  migration). `INGEST_TOKEN` is retained solely as the dashboard-to-backend service credential.

## References

- GitHub Docs — about security hardening with OpenID Connect —
  https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
- RFC 7519 — JSON Web Token — https://www.rfc-editor.org/rfc/rfc7519
- OWASP Top 10 — https://owasp.org/Top10/
