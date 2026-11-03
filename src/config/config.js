import convict from 'convict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import convictFormatWithValidator from 'convict-format-with-validator'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const thirtyMinutesMs = 1800000
const eightHoursMs = 28800000
const oneWeekMs = 604800000

// Placeholder so local development runs without secrets. Rejected outside local.
const DEFAULT_COOKIE_PASSWORD =
  'the-password-must-be-at-least-32-characters-long'

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'

convict.addFormats(convictFormatWithValidator)

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 3000,
    env: 'PORT'
  },
  staticCacheTimeout: {
    doc: 'Static cache timeout in milliseconds',
    format: Number,
    default: oneWeekMs,
    env: 'STATIC_CACHE_TIMEOUT'
  },
  serviceName: {
    doc: 'Applications Service Name',
    format: String,
    default: 'mmo-cr-copilot-dashboard'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  root: {
    doc: 'Project root',
    format: String,
    default: path.resolve(dirname, '../..')
  },
  assetPath: {
    doc: 'Asset path',
    format: String,
    default: '/public',
    env: 'ASSET_PATH'
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDevelopment
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  log: {
    enabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: process.env.NODE_ENV !== 'test',
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in.',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-ingest-token"]',
        'res.headers'
      ],
      env: 'LOG_REDACT'
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  session: {
    cache: {
      engine: {
        doc: 'backend cache is written to',
        format: ['redis', 'memory'],
        default: isProduction ? 'redis' : 'memory',
        env: 'SESSION_CACHE_ENGINE'
      },
      name: {
        doc: 'server side session cache name',
        format: String,
        default: 'session',
        env: 'SESSION_CACHE_NAME'
      },
      ttl: {
        doc: 'server side session cache ttl',
        format: Number,
        default: eightHoursMs,
        env: 'SESSION_CACHE_TTL'
      }
    },
    idleTimeoutMs: {
      doc: 'Sign the user out after this long without a user-initiated request',
      format: 'nat',
      default: thirtyMinutesMs,
      env: 'SESSION_IDLE_TIMEOUT_MS'
    },
    absoluteTimeoutMs: {
      doc: 'Sign the user out this long after sign-in, however active they are',
      format: 'nat',
      default: eightHoursMs,
      env: 'SESSION_ABSOLUTE_TIMEOUT_MS'
    },
    cookie: {
      ttl: {
        doc: 'Session cookie ttl',
        format: Number,
        default: eightHoursMs,
        env: 'SESSION_COOKIE_TTL'
      },
      password: {
        doc: 'session cookie password. Required outside local development.',
        format: String,
        default: DEFAULT_COOKIE_PASSWORD,
        env: 'SESSION_COOKIE_PASSWORD',
        sensitive: true
      },
      secure: {
        doc: 'set secure flag on cookie',
        format: Boolean,
        default: isProduction,
        env: 'SESSION_COOKIE_SECURE'
      }
    }
  },
  redis: {
    host: {
      doc: 'Redis cache host',
      format: String,
      default: '127.0.0.1',
      env: 'REDIS_HOST'
    },
    username: {
      doc: 'Redis cache username',
      format: String,
      default: '',
      env: 'REDIS_USERNAME'
    },
    password: {
      doc: 'Redis cache password',
      format: '*',
      default: '',
      sensitive: true,
      env: 'REDIS_PASSWORD'
    },
    keyPrefix: {
      doc: 'Redis cache key prefix name used to isolate the cached results across multiple clients',
      format: String,
      default: 'mmo-cr-copilot-dashboard:',
      env: 'REDIS_KEY_PREFIX'
    },
    useSingleInstanceCache: {
      doc: 'Connect to a single instance of redis instead of a cluster.',
      format: Boolean,
      default: !isProduction,
      env: 'USE_SINGLE_INSTANCE_CACHE'
    },
    useTLS: {
      doc: 'Connect to redis using TLS',
      format: Boolean,
      default: isProduction,
      env: 'REDIS_TLS'
    }
  },
  nunjucks: {
    watch: {
      doc: 'Reload templates when they are changed.',
      format: Boolean,
      default: isDevelopment
    },
    noCache: {
      doc: 'Use a cache and recompile templates each time',
      format: Boolean,
      default: isDevelopment
    }
  },
  tracing: {
    header: {
      doc: 'Which header to track',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  auth: {
    devBypass: {
      doc: 'Explicit opt-in to local sign-in personas and x-dev-user-* headers. Refused outside the local environment and tests.',
      format: Boolean,
      default: false,
      env: 'AUTH_DEV_BYPASS'
    },
    tokenRefreshSkewMs: {
      doc: 'Refresh the access token when less than this remains before it expires',
      format: 'nat',
      default: 300000,
      env: 'AUTH_TOKEN_REFRESH_SKEW_MS'
    },
    tokenEndpointTimeoutMs: {
      doc: 'Timeout for requests to the Entra token endpoint',
      format: 'nat',
      default: 10000,
      env: 'AUTH_TOKEN_ENDPOINT_TIMEOUT_MS'
    },
    postLogoutRedirectUri: {
      doc: 'Where Entra sends the browser after sign-out; must be registered as a redirect URI',
      format: String,
      default: 'http://localhost:3000/',
      env: 'ENTRA_POST_LOGOUT_REDIRECT_URI'
    },
    entraTenantId: {
      doc: 'Microsoft Entra tenant ID',
      format: String,
      default: '',
      env: 'ENTRA_TENANT_ID'
    },
    entraClientId: {
      doc: 'Microsoft Entra application (client) ID',
      format: String,
      default: '',
      env: 'ENTRA_CLIENT_ID'
    },
    entraBackendClientId: {
      doc: 'Microsoft Entra backend application (client) ID or App ID URI',
      format: String,
      default: '',
      env: 'ENTRA_BACKEND_CLIENT_ID'
    },
    entraBackendScope: {
      doc: 'Microsoft Entra backend API scope name',
      format: String,
      default: 'access_as_user',
      env: 'ENTRA_BACKEND_SCOPE'
    },
    entraClientSecret: {
      doc: 'Microsoft Entra client secret',
      format: String,
      default: '',
      env: 'ENTRA_CLIENT_SECRET',
      sensitive: true
    },
    redirectUri: {
      doc: 'Redirect URI registered in Entra app registration',
      format: String,
      default: 'http://localhost:3000/auth/callback',
      env: 'ENTRA_REDIRECT_URI'
    }
  },
  backend: {
    apiUrl: {
      doc: 'Base URL of mmo-cr-copilot-backend. Resolved through CDP service discovery in deployed environments.',
      format: String,
      default: 'http://localhost:3001',
      env: 'COPILOT_BACKEND_API_URL'
    },
    requestTimeoutMs: {
      doc: 'Timeout applied to each request forwarded to the backend',
      format: Number,
      default: 10000,
      env: 'BACKEND_REQUEST_TIMEOUT_MS'
    }
  },
  ingest: {
    token: {
      doc: 'Shared secret presented by the GitHub Actions workflow on POST /api/ingest, and forwarded to the backend. Required outside local development.',
      format: String,
      default: '',
      sensitive: true,
      env: 'INGEST_TOKEN'
    },
    maxPayloadBytes: {
      doc: 'Maximum accepted size of an ingest request body. Must match INGEST_MAX_PAYLOAD_BYTES in the backend, which this route forwards to. Sized in backend ADR 0001 (payload contract v2).',
      format: Number,
      default: 2097152,
      env: 'INGEST_MAX_PAYLOAD_BYTES'
    },
    allowSharedToken: {
      doc: 'Accept the shared x-ingest-token on POST /api/ingest when no GitHub OIDC bearer token is sent. Set to false once every caller sends OIDC tokens (dashboard ADR 0003).',
      format: Boolean,
      default: true,
      env: 'INGEST_ALLOW_SHARED_TOKEN'
    },
    oidc: {
      audience: {
        doc: 'Audience the analytics workflow requests for its GitHub Actions OIDC token',
        format: String,
        default: 'mmo-cr-copilot-dashboard',
        env: 'INGEST_OIDC_AUDIENCE'
      },
      ownerId: {
        doc: 'Numeric GitHub id of the DEFRA organisation; tokens from any other owner are rejected. OIDC ingest is refused while this is empty.',
        format: String,
        default: '',
        env: 'INGEST_OIDC_OWNER_ID'
      },
      workflowRefPrefix: {
        doc: 'Required prefix of the token job_workflow_ref claim: the shared analytics workflow',
        format: String,
        default:
          'DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics.yml@',
        env: 'INGEST_OIDC_WORKFLOW_REF_PREFIX'
      },
      allowedEvents: {
        doc: 'Comma-separated GitHub event names allowed to publish analytics',
        format: String,
        default: 'pull_request,workflow_dispatch',
        env: 'INGEST_OIDC_ALLOWED_EVENTS'
      },
      survivalWorkflowRefPrefix: {
        doc: 'Required prefix of the token job_workflow_ref claim for POST /api/ingest/survival: the shared survival workflow',
        format: String,
        default:
          'DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics-survival.yml@',
        env: 'INGEST_OIDC_SURVIVAL_WORKFLOW_REF_PREFIX'
      },
      survivalAllowedEvents: {
        doc: 'Comma-separated GitHub event names allowed to publish AI code survival records',
        format: String,
        default: 'schedule,workflow_dispatch',
        env: 'INGEST_OIDC_SURVIVAL_ALLOWED_EVENTS'
      }
    }
  },
  dashboard: {
    pollIntervalMs: {
      doc: 'How often the dashboard polls the backend for new analytics payloads',
      format: Number,
      default: 15000,
      env: 'DASHBOARD_POLL_INTERVAL_MS'
    }
  }
})

config.validate({ allowed: 'strict' })

const bypassAllowed =
  config.get('cdpEnvironment') === 'local' || process.env.NODE_ENV === 'test'

if (config.get('auth.devBypass') && !bypassAllowed) {
  throw new Error(
    'AUTH_DEV_BYPASS is only allowed in the local environment and in tests'
  )
}

if (
  config.get('session.absoluteTimeoutMs') < config.get('session.idleTimeoutMs')
) {
  throw new Error(
    'SESSION_ABSOLUTE_TIMEOUT_MS must not be shorter than SESSION_IDLE_TIMEOUT_MS'
  )
}

if (config.get('session.cache.ttl') < config.get('session.absoluteTimeoutMs')) {
  throw new Error(
    'SESSION_CACHE_TTL must not be shorter than SESSION_ABSOLUTE_TIMEOUT_MS'
  )
}

/**
 * Secrets must fail closed. Defaulting them keeps local development
 * frictionless, but a deployed environment that lost its SSM injection would
 * otherwise sign cookies with a value published in this repository, or accept
 * unauthenticated ingest and only log a warning.
 */
if (config.get('cdpEnvironment') !== 'local') {
  const required = [
    ['ingest.token', 'INGEST_TOKEN'],
    ['session.cookie.password', 'SESSION_COOKIE_PASSWORD'],
    ['auth.entraTenantId', 'ENTRA_TENANT_ID'],
    ['auth.entraClientId', 'ENTRA_CLIENT_ID'],
    ['auth.entraClientSecret', 'ENTRA_CLIENT_SECRET'],
    ['auth.entraBackendClientId', 'ENTRA_BACKEND_CLIENT_ID'],
    ['auth.redirectUri', 'ENTRA_REDIRECT_URI'],
    ['auth.postLogoutRedirectUri', 'ENTRA_POST_LOGOUT_REDIRECT_URI']
  ]

  const missing = required
    .filter(([key]) => !config.get(key).trim())
    .map(([, env]) => env)

  if (config.get('session.cookie.password') === DEFAULT_COOKIE_PASSWORD) {
    missing.push('SESSION_COOKIE_PASSWORD (still set to the shipped default)')
  }

  for (const [key, env] of [
    ['auth.redirectUri', 'ENTRA_REDIRECT_URI'],
    ['auth.postLogoutRedirectUri', 'ENTRA_POST_LOGOUT_REDIRECT_URI']
  ]) {
    if (!config.get(key).startsWith('https://')) {
      missing.push(`${env} (must be an https URL)`)
    }
  }

  if (missing.length) {
    throw new Error(
      `Missing required configuration in the '${config.get('cdpEnvironment')}' environment: ${missing.join(', ')}`
    )
  }
}
