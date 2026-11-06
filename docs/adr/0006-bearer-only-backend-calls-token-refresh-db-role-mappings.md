# 0006. Bearer-only backend calls, server-side token refresh and database role mappings

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes in part:** [0002](0002-entra-id-authentication.md)

## Context

[ADR 0002](0002-entra-id-authentication.md) had the BFF forward the user's Entra access token and
also an HMAC-signed `x-cdp-user-context` header, kept project access in group arrays on each project,
fell back to ID-token claims for the user, and left token refresh as a follow-up. Backend
[ADR 0008](https://github.com/DEFRA/mmo-cr-copilot-backend/blob/main/docs/adr/0008-entra-token-validation-role-mappings-and-authorize-endpoint.md)
now validates every access token and resolves roles from mappings stored in the database, so the BFF
no longer needs to vouch for the user.

## Decision

- **Bearer on every call.** The BFF sends `Authorization: Bearer <access token>` to the backend and
  nothing else about the user. The HMAC user context and `AUTH_CONTEXT_SECRET` are removed, with no
  legacy path. `forward()` strips any client `authorization`, `cookie` and `x-user-*` headers; only
  the ingest routes read an `Authorization` header from the caller (a GitHub OIDC token).
- **Fail closed at sign-in.** The callback requires an access token and a refresh token and a
  successful `POST /api/auth/authorize`. Otherwise no session is created: `403` when the backend says
  the user has no role, `401` for any other failure, `502` when Entra or the backend is unreachable.
- **Token storage.** Tokens live only in the server-side session (Redis), never in the cookie or
  `/api/me`, which returns an allow-listed user (`oid`, `name`, `email`, `roles`, `projectRoles`,
  `allowedProjects`). Redis therefore holds refresh tokens and must be access-controlled and
  encrypted in transit.
- **Refresh.** When under five minutes remain the BFF refreshes with the refresh token, stores the
  rotated tokens and re-reads `GET /api/auth/me`, so a role change applies at the next refresh.
  Refreshes are single-flight per session in a process. Across instances the last write wins: a
  concurrent refresh may rotate the token twice, and Entra accepts the previous refresh token until
  it is used, so the worst case is one extra refresh, not a sign-out.
- **401 handling.** A `401` from the backend triggers one forced refresh and one retry. A second
  `401`, or a refresh Entra rejects (`invalid_grant`), clears the session and answers `401`; the SPA
  then sends the user to `/login?returnTo=`. A transient Entra failure keeps an unexpired token and
  returns `502` once it has expired.
- **Timeouts.** The session ends after 30 minutes without user activity or 8 hours in total.
  Background polling sends `x-background-poll: 1` and does not extend the idle window; activity
  writes are throttled to once a minute.
- **Sign-out.** `/logout` clears the server session and redirects to Entra's
  `end_session_endpoint` with `post_logout_redirect_uri` (registered on the dashboard app
  registration). It stays a `GET` so a link works; the session is cleared before the redirect.
- **Public routes are explicit.** Routes opt out of sign-in with `options.app.public`: health,
  `/login`, `/auth/callback`, `/logout`, `/api/me`, static assets and both ingest routes
  (`/api/ingest`, `/api/ingest/survival`), which carry their own credentials. Everything else
  requires a session.
- **Ingest repository check.** The BFF asks `GET /api/ingest/repositories/{fullName}` with the ingest
  token and accepts the payload only when `mapped` is `true`.
- **Dev bypass.** `AUTH_DEV_BYPASS=true` signs in a dev persona whose token the backend accepts only
  when its own bypass is on. Configuration refuses it unless `ENVIRONMENT=local` or under test, and a
  deployed environment fails to start when any Entra setting is missing or a redirect URI is not
  `https`. Dev headers are ignored when the bypass is off. `authorization` and `cookie` are redacted
  from logs in every environment.
- **Role mappings.** Mappings (group display name → `Dashboard.Admin`, `project-admin` or
  `project-user`, plus a project slug for project roles) live in the backend. The BFF exposes an
  allow-listed `GET/POST/PATCH/DELETE /api/role-mappings` for a Dashboard Admin only, with joi
  validation and CSRF protection on writes; Project Admins have no access to mappings and keep
  repository and persona mapping. The old `PUT /api/projects/{slug}/user-groups` route is removed.
  Project slugs are 3 or 4 capital letters or numbers.
- **Display names are the key.** The `groups` claim carries group display names in this tenant, so
  mappings match a name exactly and case-sensitively. A display name can be renamed and is not
  unique, so someone able to create or rename a group in Entra could gain a role. This is an
  **accepted risk**, mitigated by restricting group creation in Entra, the warning shown beside the
  Group Name field, and audit events for every mapping change.

## Consequences

- The BFF is no longer a point of trust for identity, and one secret (`AUTH_CONTEXT_SECRET`) is gone.
- Redis holds refresh tokens; losing it signs everyone out, which is safe.
- A user removed from a group keeps access until the next refresh (at most about an hour) or session end.
- New configuration: `ENTRA_POST_LOGOUT_REDIRECT_URI`, `AUTH_DEV_BYPASS`, the timeout and refresh
  settings; the dashboard app registration needs the post-logout redirect URI.
- Local development needs `AUTH_DEV_BYPASS=true` in both repositories.

## Alternatives considered

- **MSAL Node** — a heavier dependency with its own token cache; the hand-written code flow is small
  and already tested.
- **A distributed refresh lock** — extra Redis coordination for a rare race that last-write-wins
  already tolerates.
- **Keeping the HMAC user context** — a second source of truth that the backend no longer needs.
- **Keying mappings on object IDs** — stable and unique, but the product owner chose display names
  because that is what the tenant emits.

## References

- Microsoft Learn — refresh tokens —
  https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
- Microsoft Learn — RP-initiated logout —
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc#send-a-sign-out-request
- OWASP ASVS V3 (session management)
