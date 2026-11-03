# 0002. Microsoft Entra ID authentication and authorisation

- **Status:** Accepted, partially superseded by [0006](0006-bearer-only-backend-calls-token-refresh-db-role-mappings.md)
- **Date:** 2026-10-15

## Superseded parts

[ADR 0006](0006-bearer-only-backend-calls-token-refresh-db-role-mappings.md) supersedes these parts
of this record. The text below is kept as it was written.

- The BFF-signed `x-cdp-user-context` (HMAC) and `AUTH_CONTEXT_SECRET`: removed. The backend
  authorises from the bearer token alone.
- Project access by `project.adminGroupIds` and `project.entraGroupIds`: replaced by role mappings
  stored in the backend database and managed by a Dashboard Admin.
- The ID-token fallback for the user: removed. Sign-in fails without an access token.
- "Refresh-token renewal is a follow-up": the BFF now refreshes tokens (see 0006).
- The "Dashboard.User" role and the "Runbook" section: the runbook moved to
  [docs/runbooks/entra-id-setup.md](../runbooks/entra-id-setup.md).

## Context

The dashboard is the only publicly reachable part of the system. It has no sign-in today, and its
proxy routes include writes (commit re-classification and persona mapping changes). Planned admin
screens will write project configuration.

Requirements: sign in with Microsoft Entra ID using a **dual app registration** (a dashboard app
registration for sign-in and a backend app registration that exposes the API); an admin role; project
access by Entra security group; a user in several projects can switch between them; the backend also
enforces project scope.

Findings that shape the decision:

- Group claims in a token are limited; beyond 200 groups in a JWT the token carries an overage
  indicator instead and groups must be fetched from Microsoft Graph.
- Configuring the groups claim as "Groups assigned to the application" avoids overage, but covers
  direct membership only and needs Entra ID P1.
- `oid` and `tid` are immutable; email and `preferred_username` can change.
- `login.microsoftonline.com` is in the CDP default egress allow-list; `graph.microsoft.com` is not.

## Decision

- **Dual app registration.** The _dashboard_ app registration signs users in and holds the client
  secret. The _backend_ app registration exposes the API scope `access_as_user` (App ID URI
  `api://<backend-client-id>`). The dashboard requests
  `openid profile email offline_access api://<backend-client-id>/access_as_user`
  (`ENTRA_BACKEND_CLIENT_ID`, `ENTRA_BACKEND_SCOPE`).
- **Bearer token proxying.** The user's Entra access token is kept server-side in the session and
  forwarded as `Authorization: Bearer <access_token>` on every proxied call; the browser never sees
  it (`/api/me` strips tokens). The backend verifies the signature against the Entra JWKS and
  validates `aud` (backend client ID or App ID URI) and `scp` (contains `access_as_user`) on every
  request.
- **DB-backed role mapping.** After sign-in the dashboard calls `POST /api/auth/authorize`; the
  backend resolves the token's `groups` claim to application and project roles stored in MongoDB
  and returns `{ user: { oid, tid, name, email, roles, groups, projectRoles, allowedProjects } }`.
  A user with no assigned roles gets 403 and no session.
- Web sign-in uses the **authorisation code flow with PKCE**, with a redirect URI per
  environment and the credential stored as a CDP Portal secret per environment.
- Local and test development uses a **dev session stub** when Entra ID is not configured, providing
  an automatic fallback user with configurable role overrides.
- Application roles `Dashboard.Admin` and `Dashboard.User` are resolved by the backend from Entra
  security groups mapped in MongoDB, not read from the ID token `roles` claim.
- Groups claim set to **"Groups assigned to the application"** on the backend app registration, so
  the 200-group overage is avoided. Allowed projects are the user's groups intersected with each
  project's group IDs; admins see all.
- A **three-tier role model**, with project roles resolved per project from the user's groups:
  - **Dashboard Admin** — Entra app role `Dashboard.Admin`. Creates, updates and deletes projects and
    onboards project admins; has access to every project.
  - **Project Admin** — the user belongs to an Entra group in `project.adminGroupIds`. Manages the
    project's user groups, repository mapping to the project and persona mapping.
  - **Project User** — the user belongs to an Entra group in `project.entraGroupIds`. Has read access
    to project features, can view audit logs in Settings and read commit logs (read-only).
  - **Deny by default** — a project with no groups configured is accessible only to dashboard admins
    until groups are set. Users without access to a project see the animated lock-gate unauthorised
    page.
- Key users on **`oid` + `tid`**, never on email or `preferred_username`.
- Sessions stay in `@hapi/yar` with Redis; regenerate the session on sign-in; idle and absolute
  timeouts; sign-out clears the server session.
- **CSRF protection** on every cookie-authenticated write (PATCH, PUT, DELETE). Ingest is outside
  cookie auth.
- The BFF authorises every proxied call and passes the user's Bearer token; the BFF-signed context
  `x-cdp-user-context` (HMAC-SHA256) is retained for backwards compatibility.
- **Commit re-classification and persona mapping mutations are admin-only.**
  `PATCH /api/payloads/{repo}/{prNumber}/commits/{commit}`, `PUT /api/persona-mappings/{handle}`,
  and `DELETE /api/persona-mappings/{handle}` require `Dashboard.Admin`, enforced at the BFF and
  again by the backend from the signed context (defence in depth). The audit event records the
  admin's `oid`.

## Consequences

- Every page and proxy route requires sign-in except health, ingest and static assets.
- Admin screens and existing write routes are gated by `Dashboard.Admin`.
- A local OIDC stub is needed for development and tests.
- The backend verifies the Bearer token (JWKS, `aud`, `scp`) on every request.
- Local and test development forwards the placeholder `Bearer dev-mock` token.
- Access tokens expire (`expiresAt` is stored in the session); refresh-token renewal is a follow-up.
- Audit events record `oid` and display name; logs carry no PII.

## Alternatives considered

- **Groups claim with all security groups** — overage for users in many groups.
- **Always resolve groups through Microsoft Graph** — extra egress, latency and permissions.
- **Implicit flow** — deprecated for this use; no PKCE.
- **Trust the BFF network position only** — no defence in depth if the backend is reached another way.

## Open points

Resolved (B1.1, October 2026):

- **Library:** keep the hand-written authorisation code flow; `jose` verifies the ID token
  (`jwtVerify` against the tenant JWKS, issuer, audience, `RS256`, 60 s clock tolerance) and Node
  `crypto` generates `state`, `nonce` and the PKCE verifier (S256). One small dependency and no
  extra Hapi plugin.
- **Overage fallback:** deny with a clear message (403) and log `reason: group-overage`; no
  Microsoft Graph call, because `graph.microsoft.com` is not on the egress allow-list.
- **Sessions:** server-side only (`maxCookieSize: 0`), regenerated on sign-in, reset on sign-out.
  The dev session stub is refused outside local and test environments.
- **Egress:** the token and JWKS requests use the global `fetch`; deployed environments set
  `NODE_USE_ENV_PROXY=1` so Node honours the platform `HTTP_PROXY`.

Still open:

- Which tenant, who owns the app registration and groups, and whether Entra ID P1 is available.
- Session idle and absolute timeout values.

## References

- Microsoft Learn — configure group claims and app roles in tokens —
  https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles
- Microsoft Learn — ID token claims reference —
  https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
- Microsoft Learn — authorisation code flow —
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- OWASP Cross-Site Request Forgery Prevention Cheat Sheet —
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## Runbook

Moved to [docs/runbooks/entra-id-setup.md](../runbooks/entra-id-setup.md).
