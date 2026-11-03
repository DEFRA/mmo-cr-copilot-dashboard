# mmo-cr-copilot-dashboard

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_mmo-cr-copilot-dashboard&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_mmo-cr-copilot-dashboard)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_mmo-cr-copilot-dashboard&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_mmo-cr-copilot-dashboard)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_mmo-cr-copilot-dashboard&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_mmo-cr-copilot-dashboard)

Copilot analytics dashboard — a React single page app served by a Hapi backend-for-frontend.

It visualises how adopting GitHub Copilot has changed delivery: adoption and assist rates, cycle
time, rework, contributor and repository breakdowns, and SonarCloud code quality — with drill-downs
from the portfolio overview down to an individual commit.

## Architecture

```text
GitHub Actions --POST /api/ingest--> mmo-cr-copilot-dashboard --POST--> mmo-cr-copilot-backend
                                              |                                |
        browser <--GET /api/payloads (poll)---+                             MongoDB
                                              +--GET /api/sonar/*--> backend --> SonarCloud
```

This service is the only publicly reachable part of the system:

- **Ingest.** The analytics workflow posts one payload per pull request build to `POST /api/ingest`,
  authenticated with a GitHub Actions OIDC token (or the shared `x-ingest-token`). The payload is forwarded to the
  backend, which validates and persists it — validation lives in one place only.
- **Backend-for-frontend.** `GET /api/*` is proxied to the backend over the platform's internal
  network. Each route builds its own upstream path from validated parameters, so the browser cannot
  steer a request at an arbitrary host or path. The backend stays internal: no CORS, no public
  backend URL, and no credentials in the bundle.
- **Shell.** `GET /` renders a Nunjucks shell that the React app mounts into. Runtime configuration
  is passed as `data-` attributes rather than an inline `<script>`, so the Content-Security-Policy
  forbids inline script in every environment.
- **Updates.** The dashboard polls `GET /api/payloads` on an interval, backing off exponentially when
  the backend is unavailable and keeping the last known data on screen.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Configuration](#configuration)
- [Ingest API](#ingest-api)
- [Server-side Caching](#server-side-caching)
- [Redis](#redis)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Configuration

All configuration is read from environment variables via convict (`src/config/config.js`). In CDP
environments these are injected from AWS Secrets Manager and Parameter Store through the CDP Portal —
never commit secrets.

| Variable                                   | Required | Description                                                                                                                                                                                                                          |
| :----------------------------------------- | :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COPILOT_BACKEND_API_URL`                  | Yes      | Base URL of mmo-cr-copilot-backend, resolved through CDP service discovery                                                                                                                                                           |
| `INGEST_TOKEN`                             | Yes      | Shared secret presented by the GitHub Actions workflow and forwarded to the backend. The same value is set in the workflow, here, and on the backend. When empty the check is skipped, which is intended for local development only. |
| `INGEST_ALLOW_SHARED_TOKEN`                | No       | Accept `x-ingest-token` from callers that send no OIDC token, default `true`. Set to `false` once every caller uses OIDC (ADR 0003).                                                                                                 |
| `INGEST_OIDC_AUDIENCE`                     | No       | Audience the analytics workflow requests for its GitHub OIDC token, default `mmo-cr-copilot-dashboard`                                                                                                                               |
| `INGEST_OIDC_OWNER_ID`                     | For OIDC | Numeric GitHub id of the DEFRA organisation. OIDC ingest is refused while it is empty.                                                                                                                                               |
| `INGEST_OIDC_WORKFLOW_REF_PREFIX`          | No       | Required prefix of the token's `job_workflow_ref`, default the shared `copilot-analytics.yml` workflow in `mmo-cr-devops-common`                                                                                                     |
| `INGEST_OIDC_ALLOWED_EVENTS`               | No       | Comma-separated events allowed to publish, default `pull_request,workflow_dispatch`                                                                                                                                                  |
| `INGEST_OIDC_SURVIVAL_WORKFLOW_REF_PREFIX` | No       | Required prefix of the `job_workflow_ref` for `POST /api/ingest/survival`, default the `copilot-analytics-survival.yml` workflow in `mmo-cr-devops-common`                                                                           |
| `INGEST_OIDC_SURVIVAL_ALLOWED_EVENTS`      | No       | Comma-separated events allowed to publish survival records, default `schedule,workflow_dispatch`                                                                                                                                     |
| `ENTRA_TENANT_ID`                          | Yes      | Microsoft Entra tenant for sign-in. Required outside local development; use `AUTH_DEV_BYPASS=true` locally instead.                                                                                                                  |
| `ENTRA_CLIENT_ID`                          | Yes      | Entra application (client) id; also the expected ID-token audience                                                                                                                                                                   |
| `ENTRA_CLIENT_SECRET`                      | Yes      | Entra client secret                                                                                                                                                                                                                  |
| `ENTRA_REDIRECT_URI`                       | Yes      | Redirect URI registered for this environment, ending `/auth/callback`                                                                                                                                                                |
| `ENTRA_BACKEND_CLIENT_ID`                  | Yes      | Client id of the backend app registration; the API scope is `api://<id>/access_as_user` unless `ENTRA_BACKEND_SCOPE` is set                                                                                                          |
| `ENTRA_POST_LOGOUT_REDIRECT_URI`           | Yes      | Where Entra returns the browser after sign-out (an `https` URI registered on the dashboard app registration, normally the site root)                                                                                                 |
| `AUTH_DEV_BYPASS`                          | No       | `true` signs in a dev persona without Entra. Refused unless `ENVIRONMENT=local` or under test; deployed environments fail to start if Entra settings are incomplete                                                                  |
| `AUTH_TOKEN_REFRESH_SKEW_MS`               | No       | Refresh the access token when less than this remains, default 300000 (5 minutes)                                                                                                                                                     |
| `SESSION_IDLE_TIMEOUT_MS`                  | No       | Sign out after this long without user activity, default 1800000 (30 minutes). Background polling does not count                                                                                                                      |
| `SESSION_ABSOLUTE_TIMEOUT_MS`              | No       | Sign out after this long regardless of activity, default 28800000 (8 hours)                                                                                                                                                          |
| `DASHBOARD_POLL_INTERVAL_MS`               | No       | How often the browser polls for new payloads, default 15000                                                                                                                                                                          |
| `BACKEND_REQUEST_TIMEOUT_MS`               | No       | Timeout applied to each request forwarded to the backend, default 10000                                                                                                                                                              |
| `INGEST_MAX_PAYLOAD_BYTES`                 | No       | Maximum accepted ingest body size, default 2 MiB                                                                                                                                                                                     |
| `SESSION_COOKIE_PASSWORD`                  | Yes      | Session cookie secret, at least 32 characters                                                                                                                                                                                        |
| `REDIS_HOST`                               | Yes      | Redis host backing the server-side session cache                                                                                                                                                                                     |

## Ingest API

```http
POST /api/ingest
Content-Type: application/json
Authorization: Bearer <GitHub Actions OIDC token>
```

The shared workflow in `mmo-cr-devops-common` sends a short-lived GitHub Actions OIDC token
([ADR 0003](docs/adr/0003-ingest-authentication-github-oidc.md)). The service checks its signature,
issuer, audience, the DEFRA organisation, the workflow and the event, rejects a reused token, and
only accepts a payload for the token's own repository once that repository is mapped to a project.
Until `INGEST_ALLOW_SHARED_TOKEN` is turned off, a caller without a token may send
`x-ingest-token: <shared secret>` instead.

The body is the analytics payload for one pull request build: `prNumber`, `repository`,
`targetBranch`, `buildId`, `calculatedAt`, `summary`, `contributorBreakdown`, and `commitBreakdown`.
The backend's response is relayed unchanged — `201` when stored, `400` when the payload fails
validation, `401` when the credential is missing or wrong, `403` when the repository is not the
caller's or is not mapped, and `502` when the backend cannot be reached.

Payloads are appended rather than replaced, so each pull request keeps its full history.
`sourceBranch` may be omitted on the final merged message; the backend backfills it from the previous
message for that pull request.

### AI code survival

```http
POST /api/ingest/survival
Content-Type: application/json
Authorization: Bearer <GitHub Actions OIDC token>
```

The scheduled `copilot-analytics-survival.yml` workflow in `mmo-cr-devops-common` publishes one
`ai-survival` record per merged pull request, 21 days after the merge
([ADR 0005](docs/adr/0005-survival-ingest-route.md)). Only an OIDC token from that workflow, on a
`schedule` or `workflow_dispatch` event, is accepted; there is no shared-secret fallback, and an
analytics-workflow token is refused. The record is relayed to the backend, which validates it
(backend ADR 0007). The body is limited to 256 KB.

## Onboard a project

You need the `Dashboard.Admin` role.

1. **Create the project.** Choose _Manage projects_ in the project switcher and add the project
   (name, slug, type and, for AI-adopted projects, the Copilot adoption date).
2. **Map the repositories.** In _Repository mapping_, map each repository (`owner/name`) to the
   project. Data from unmapped repositories is refused.
3. **Add the caller workflow** to each repository, as in the `mmo-cr-devops-common` README, with
   `permissions: id-token: write` on the job and `ingest-url` set to this service's
   `/api/ingest`.
4. **Set the SonarCloud and Jira keys.** Give each repository its Sonar project key and the
   project its Jira project keys.
5. **Map Entra groups to roles.** In _Role Mappings_ (Settings), add the group display names for
   the project's admins and users. Groups are matched on their exact, case-sensitive display name.
6. **Check that payloads appear.** Open or update a pull request, then open the project overview;
   the workflow's job summary shows whether the payload was published.

### Roles and access

| Role            | Granted by                                        | Can                                                                            |
| :-------------- | :------------------------------------------------ | :----------------------------------------------------------------------------- |
| Dashboard Admin | A role mapping to `Dashboard.Admin`               | Manage projects and role mappings; has access to every project                 |
| Project Admin   | A role mapping to `project-admin` for the project | Manage the project's repository mapping and persona mapping                    |
| Project User    | A role mapping to `project-user` for the project  | Read the project, view audit logs in Settings and read commit logs (read-only) |

Role mappings (Entra group display name → role and project) are stored in the backend and managed
only by a Dashboard Admin. Access is deny by default: a user whose groups match no mapping cannot
sign in. Project slugs are 3 or 4 capital letters or numbers, such as `CRAR`.

## Authentication

Users sign in with Microsoft Entra ID (authorisation code flow with PKCE). The BFF keeps the user's
access and refresh tokens in the server-side session and sends the access token to the backend as
`Authorization: Bearer` on every proxied call; the browser never sees a token. The BFF refreshes the
token before it expires, retries once after a `401`, and otherwise sends the user to sign in again.
Sessions end after 30 minutes idle or 8 hours, and sign-out also ends the Entra session.

Entra emits group display names in the `groups` claim for this application, so role mappings use
names, not object IDs. See [ADR 0006](docs/adr/0006-bearer-only-backend-calls-token-refresh-db-role-mappings.md)
and the [Entra setup runbook](docs/runbooks/entra-id-setup.md).

### Local development without Entra

Set `AUTH_DEV_BYPASS=true` (and `ENVIRONMENT=local`) here and in the backend, run `npm run seed` in
the backend, then start both. The dashboard signs in the dev admin; use `/login?role=project-admin`,
`user` or `nobody` to try other personas. The flag is refused outside local and test.

## Requirements

### Node.js

Please install Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd mmo-cr-copilot-dashboard
nvm use
```

## Server-side Caching

We use Catbox for server-side caching. By default the service will use CatboxRedis when deployed and CatboxMemory for
local development.
You can override the default behaviour by setting the `SESSION_CACHE_ENGINE` environment variable to either `redis` or
`memory`.

Please note: CatboxMemory (`memory`) is _not_ suitable for production use! The cache will not be shared between each
instance of the service and it will not persist between restarts.

## Redis

Redis is an in-memory key-value store. Every instance of a service has access to the same Redis key-value store similar
to how services might have a database (or MongoDB). All frontend services are given access to a namespaced prefixed that
matches the service name. e.g. `my-service` will have access to everything in Redis that is prefixed with `my-service`.

If your service does not require a session cache to be shared between instances or if you don't require Redis, you can
disable setting `SESSION_CACHE_ENGINE=false` or changing the default value in `src/config/index.js`.

## Proxy

We are using forward-proxy which is set up by default. Services are automatically configured with the proxy environment variables when deployed.

Node.js 24 uses these variables to route outbound HTTP(S) requests through the proxy:

NODE_USE_ENV_PROXY=1
HTTPS_PROXY=...
NO_PROXY=...

No additional proxy configuration is required in the service.

## Local Development

### Setup

Install application dependencies:

```bash
npm install
```

### Git hooks

Install git hooks (optional)

```bash
npm run git:hooks
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## Docker

### Development image

> [!TIP]
> For Apple Silicon users, you may need to add `--platform linux/amd64` to the `docker run` command to ensure
> compatibility fEx: `docker build --platform=linux/arm64 --no-cache --tag mmo-cr-copilot-dashboard`

Build:

```bash
docker build --target development --no-cache --tag mmo-cr-copilot-dashboard:development .
```

Run:

```bash
docker run -p 3000:3000 mmo-cr-copilot-dashboard:development
```

### Production image

Build:

```bash
docker build --no-cache --tag mmo-cr-copilot-dashboard .
```

Run:

```bash
docker run -p 3000:3000 mmo-cr-copilot-dashboard
```

### Docker Compose

Runs this service on `:3000` with Redis on `:6379` for sessions:

```bash
docker compose up --build --watch
```

The container runs the `development` image stage with `src`, `public` and `vite.config.js` mounted
from your checkout. Server edits restart Hapi through nodemon. Client edits are recompiled by Vite
and pushed to the browser over the HMR websocket on `:24678`. `--watch` also rebuilds the image
when `package.json` or `package-lock.json` changes; without it, edits are still picked up live.
To run the production image instead, use the `docker build` command above.

The dashboard calls the backend on the host's port `3001`, so start
[mmo-cr-copilot-backend](https://github.com/DEFRA/mmo-cr-copilot-backend) first, with its own
`docker compose up` or `npm run dev`. MongoDB belongs to the backend, and nothing here uses AWS, so
Floci and MongoDB are left commented out in `compose.yml`.

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties).

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
