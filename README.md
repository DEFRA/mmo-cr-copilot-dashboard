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
  authenticated with a shared secret in the `x-ingest-token` header. The payload is forwarded to the
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

| Variable                     | Required | Description                                                                                                                                                                                                                          |
| :--------------------------- | :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COPILOT_BACKEND_API_URL`    | Yes      | Base URL of mmo-cr-copilot-backend, resolved through CDP service discovery                                                                                                                                                           |
| `INGEST_TOKEN`               | Yes      | Shared secret presented by the GitHub Actions workflow and forwarded to the backend. The same value is set in the workflow, here, and on the backend. When empty the check is skipped, which is intended for local development only. |
| `DASHBOARD_POLL_INTERVAL_MS` | No       | How often the browser polls for new payloads, default 15000                                                                                                                                                                          |
| `BACKEND_REQUEST_TIMEOUT_MS` | No       | Timeout applied to each request forwarded to the backend, default 10000                                                                                                                                                              |
| `INGEST_MAX_PAYLOAD_BYTES`   | No       | Maximum accepted ingest body size, default 2 MiB                                                                                                                                                                                     |
| `SESSION_COOKIE_PASSWORD`    | Yes      | Session cookie secret, at least 32 characters                                                                                                                                                                                        |
| `REDIS_HOST`                 | Yes      | Redis host backing the server-side session cache                                                                                                                                                                                     |

## Ingest API

```http
POST /api/ingest
Content-Type: application/json
x-ingest-token: <shared secret>
```

The body is the analytics payload for one pull request build: `prNumber`, `repository`,
`targetBranch`, `buildId`, `calculatedAt`, `summary`, `contributorBreakdown`, and `commitBreakdown`.
The backend's response is relayed unchanged — `201` when stored, `400` when the payload fails
validation, `401` when the token is missing or wrong, and `502` when the backend cannot be reached.

Payloads are appended rather than replaced, so each pull request keeps its full history.
`sourceBranch` may be omitted on the final merged message; the backend backfills it from the previous
message for that pull request.

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

A local environment with:

- Floci (replacing Localstack) for AWS services (S3, SQS)
- Redis
- MongoDB
- This service.
- A commented out backend example.

```bash
docker compose up --build -d
```

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
