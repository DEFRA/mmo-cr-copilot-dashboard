import { STATUS_CODES } from 'node:http'

import Boom from '@hapi/boom'
import Joi from 'joi'

import { backendRequest } from '#/server/common/helpers/backend-client.js'
import {
  clearSession,
  getAccessToken
} from '#/server/common/helpers/session-tokens.js'

/**
 * Every mutating request must carry `x-requested-with: XMLHttpRequest`, which a
 * cross-site form cannot set, and any `Origin` it sends must be this host. The
 * host is compared without the scheme because TLS ends at the platform proxy.
 */
export function verifyCsrf(request) {
  if (request.headers['x-requested-with'] !== 'XMLHttpRequest') {
    throw Boom.forbidden('CSRF validation failed')
  }
  const origin = request.headers.origin
  if (origin === undefined) return
  let originHost
  try {
    originHost = new URL(origin).host
  } catch {
    originHost = null
  }
  if (originHost !== request.info.host) {
    throw Boom.forbidden('CSRF validation failed')
  }
}

function logAccessDenied(request, resource) {
  request.logger?.warn(
    {
      event: { category: 'iam', action: 'access-denied', reason: resource },
      user: { id: request.user?.oid }
    },
    'Access denied'
  )
}

export function assertAdmin(request) {
  if (!request.user?.roles?.includes('Dashboard.Admin')) {
    logAccessDenied(request, 'admin-role')
    throw Boom.forbidden('Admin role required')
  }
}

const BACKEND_FAILURE = 'The analytics backend could not complete the request'

async function forward(request, h, { path, query, method = 'GET', body }) {
  const send = (token) =>
    backendRequest({
      path,
      query,
      method,
      body,
      headers: { authorization: `Bearer ${token}` },
      logger: request.logger
    })

  let res = await send(await getAccessToken(request))
  if (res.statusCode === 401) {
    request.logger?.info(
      {
        event: {
          category: 'authentication',
          action: 'token-refresh',
          reason: 'backend-401'
        }
      },
      'Retrying after refresh'
    )
    res = await send(await getAccessToken(request, { forceRefresh: true }))
    if (res.statusCode === 401) {
      clearSession(request)
      throw Boom.unauthorized('Session expired')
    }
  }
  // A 4xx body is the user-facing Boom message; a 5xx body may hold internals.
  if (res.statusCode >= 500) {
    request.logger?.warn(
      { http: { response: { status_code: res.statusCode } } },
      `Backend request failed: ${method} ${path}`
    )
    return h
      .response({
        statusCode: res.statusCode,
        error: STATUS_CODES[res.statusCode] ?? 'Server Error',
        message: BACKEND_FAILURE
      })
      .code(res.statusCode)
  }
  return h.response(res.payload).code(res.statusCode)
}

const projectPath = (request) =>
  `/api/projects/${encodeURIComponent(request.params.slug)}`

const windowQuery = (request) => ({
  from: request.query.from?.toISOString(),
  to: request.query.to?.toISOString()
})

// A '.' or '..' segment would be resolved by the backend as a relative path.
const DOT_SEGMENT = /(^|\/)\.{1,2}(\/|$)/

const repositoryParam = Joi.string()
  .min(1)
  .max(512)
  .custom((value, helpers) =>
    DOT_SEGMENT.test(value)
      ? helpers.message('{{#label}} must not contain a . or .. segment')
      : value
  )

const repositoryQuery = Joi.object({
  repository: Joi.string().min(1).max(512).required(),
  asOf: Joi.date().iso().optional()
})

const githubHandleParams = Joi.object({
  githubHandle: Joi.string()
    .pattern(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i)
    .required()
})

const personaMappingPayload = Joi.object({
  persona: Joi.string().valid('developer', 'devops', 'qa').required()
})

const commitClassificationParams = Joi.object({
  repository: repositoryParam.required(),
  prNumber: Joi.number().integer().min(1).required(),
  commit: Joi.string()
    .pattern(/^[\da-f]{7,64}$/i)
    .required()
})

const commitClassificationPayload = Joi.object({
  classification: Joi.string()
    .valid('Copilot-assisted', 'Human-authored', 'Rebase', 'Dependabot')
    .required()
})

const MAX_AUDIT_PAGE_SIZE = 200

const auditLogQuery = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().greater(Joi.ref('from')).optional(),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(MAX_AUDIT_PAGE_SIZE).optional()
})

// Project slugs are 3-4 uppercase characters, for example CRAR or FES.
const PROJECT_SLUG_PATTERN = /^[A-Z][A-Z0-9]{2,3}$/
const projectSlug = Joi.string().pattern(PROJECT_SLUG_PATTERN)

const projectSlugParams = Joi.object({
  slug: projectSlug.required()
})

const prLinkParams = projectSlugParams.keys({
  repository: repositoryParam.required(),
  prNumber: Joi.number().integer().min(1).required()
})

const prLinkPayload = Joi.object({
  jiraKeys: Joi.array()
    .items(Joi.string().pattern(/^[A-Z][A-Z0-9_]+-\d+$/))
    .max(20)
    .unique()
    .required()
})

const modelWeight = Joi.number().min(0).max(1).required()

const complexityModelPayload = Joi.object({
  lineCap: Joi.number().integer().min(1).max(100000).required(),
  fileCap: Joi.number().integer().min(1).max(10000).required(),
  moduleCap: Joi.number().integer().min(1).max(1000).required(),
  weights: Joi.object({
    lines: modelWeight,
    files: modelWeight,
    modules: modelWeight
  }).required(),
  hardCapLines: Joi.number().integer().min(1).max(1000000).required(),
  hardCapFiles: Joi.number().integer().min(1).max(100000).required()
}).options({ stripUnknown: true })

const projectPayloadsQuery = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional()
})

const leverageQuery = projectPayloadsQuery.keys({
  repository: Joi.string().min(1).max(512).optional()
})

const projectSprintsQuery = Joi.object({
  count: Joi.number().integer().min(1).max(50).optional()
})

const projectChurnQuery = Joi.object({
  windowDays: Joi.number().integer().min(1).max(90).default(21),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional()
}).unknown()

const repositoryFullNameParams = Joi.object({
  fullName: repositoryParam.pattern(/^[\w.-]+\/[\w.-]+$/).required()
})

// The SonarCloud key is set only through the sonar-key route.
const repositoryMapPayload = Joi.object({
  projectSlug: projectSlug.required()
}).options({ stripUnknown: true })

const repositorySonarKeyPayload = Joi.object({
  sonarProjectKey: Joi.string()
    .trim()
    .pattern(/^[\w.:-]+$/)
    .max(255)
    .allow('', null)
    .required()
}).options({ stripUnknown: true })

const jiraProjectKeys = Joi.array()
  .items(
    Joi.string()
      .trim()
      .pattern(/^[A-Z][A-Z0-9_]+$/)
  )
  .max(1)

// Mirrors the backend's project schemas: only these keys are forwarded.
const projectJiraPayload = Joi.object({
  projectKeys: jiraProjectKeys,
  storyPointsField: Joi.string(),
  boardId: Joi.number().integer().positive()
}).options({ stripUnknown: true })

const sprintCalendarPayload = Joi.object({
  cadenceDays: Joi.number().integer().min(1).max(30),
  anchorDate: Joi.date().iso()
}).options({ stripUnknown: true })

const projectCreatePayload = Joi.object({
  slug: projectSlug.required(),
  name: Joi.string().min(1).max(200).required(),
  type: Joi.string().valid('ai-adopted', 'ai-native').required(),
  adoptionStartDate: Joi.date().iso().optional(),
  sprintCalendar: sprintCalendarPayload.optional(),
  jira: projectJiraPayload.optional()
}).options({ stripUnknown: true })

const projectUpdatePayload = Joi.object({
  name: Joi.string().min(1).max(200).optional(),
  type: Joi.string().valid('ai-adopted', 'ai-native').optional(),
  adoptionStartDate: Joi.date().iso().allow(null).optional(),
  sprintCalendar: sprintCalendarPayload.optional(),
  jira: projectJiraPayload.optional()
}).options({ stripUnknown: true })

const ROLE_MAPPING_ROLES = ['Dashboard.Admin', 'project-admin', 'project-user']

// The group name is exactly what Entra emits in the groups claim: never rewritten.
const groupName = Joi.string()
  .trim()
  .min(1)
  .max(256)
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  .pattern(/^[^\u0000-\u001f\u007f]+$/)

const roleMappingIdParams = Joi.object({
  id: Joi.string().hex().length(24).required()
})

const roleMappingListQuery = Joi.object({
  projectSlug: projectSlug.optional()
})

const roleMappingCreatePayload = Joi.object({
  groupName: groupName.required(),
  role: Joi.string()
    .valid(...ROLE_MAPPING_ROLES)
    .required(),
  projectSlug: projectSlug.allow(null).optional(),
  description: Joi.string().allow('').max(500).optional()
})

const roleMappingUpdatePayload = Joi.object({
  role: Joi.string().valid(...ROLE_MAPPING_ROLES),
  projectSlug: projectSlug.allow(null),
  description: Joi.string().allow('').max(500)
}).min(1)

const roleMappingWrite = { maxBytes: 4096, allow: 'application/json' }

const WORKFLOW_STAGE_IDS = [
  'todo',
  'in-progress',
  'ready-for-review',
  'in-review',
  'ready-for-test',
  'in-test',
  'ready-for-release',
  'blocked',
  'done',
  'cancelled'
]

const workflowStatus = Joi.string()
  .trim()
  .min(1)
  .max(60)
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  .pattern(/^[^\u0000-\u001f\u007f]+$/)

// Shape only: the backend owns the cross-stage rules (required stages, duplicates, totals).
const jiraWorkflowPayload = Joi.object({
  version: Joi.number().integer().min(0).required(),
  stages: Joi.array()
    .items(
      Joi.object({
        id: Joi.string()
          .valid(...WORKFLOW_STAGE_IDS)
          .required(),
        statuses: Joi.array().items(workflowStatus).max(40).required()
      }).options({ stripUnknown: true })
    )
    .min(2)
    .max(WORKFLOW_STAGE_IDS.length)
    .unique('id')
    .required()
}).options({ stripUnknown: true })

const jiraWorkflowWrite = { maxBytes: 32768, allow: 'application/json' }

export const apiProxyRoutes = [
  {
    method: 'GET',
    path: '/api/payloads/{repository}/{prNumber}',
    options: {
      validate: {
        params: Joi.object({
          repository: repositoryParam.required(),
          prNumber: Joi.number().integer().min(1).required()
        })
      }
    },
    handler: (request, h) => {
      const { repository, prNumber } = request.params

      return forward(request, h, {
        path: `/api/payloads/${encodeURIComponent(repository)}/${prNumber}`
      })
    }
  },
  {
    method: 'PATCH',
    path: '/api/payloads/{repository}/{prNumber}/commits/{commit}',
    options: {
      validate: {
        params: commitClassificationParams,
        payload: commitClassificationPayload
      }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      const { repository, prNumber, commit } = request.params

      return forward(request, h, {
        path: `/api/payloads/${encodeURIComponent(repository)}/${prNumber}/commits/${encodeURIComponent(commit)}`,
        method: 'PATCH',
        body: { classification: request.payload.classification }
      })
    }
  },
  {
    method: 'GET',
    path: '/api/audit-logs',
    options: { validate: { query: auditLogQuery } },
    handler: (request, h) => {
      assertAdmin(request)
      const { from, to, page, pageSize } = request.query

      return forward(request, h, {
        path: '/api/audit-logs',
        query: {
          from: from?.toISOString(),
          to: to?.toISOString(),
          page,
          pageSize
        }
      })
    }
  },
  {
    method: 'GET',
    path: '/api/sonar/overview',
    options: {
      validate: {
        query: Joi.object({
          asOf: Joi.date().iso().optional()
        })
      }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: '/api/sonar/overview',
        query: request.query.asOf
          ? { asOf: request.query.asOf.toISOString() }
          : undefined
      })
  },
  {
    method: 'GET',
    path: '/api/sonar/repo',
    options: { validate: { query: repositoryQuery } },
    handler: (request, h) =>
      forward(request, h, {
        path: '/api/sonar/repo',
        query: {
          repository: request.query.repository,
          ...(request.query.asOf
            ? { asOf: request.query.asOf.toISOString() }
            : {})
        }
      })
  },
  {
    method: 'GET',
    path: '/api/sonar/pr',
    options: {
      validate: {
        query: repositoryQuery.keys({
          prNumber: Joi.number().integer().min(1).required()
        })
      }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: '/api/sonar/pr',
        query: {
          repository: request.query.repository,
          prNumber: request.query.prNumber
        }
      })
  },
  {
    method: 'GET',
    path: '/api/projects',
    handler: (request, h) => forward(request, h, { path: '/api/projects' })
  },
  {
    method: 'POST',
    path: '/api/projects',
    options: {
      validate: { payload: projectCreatePayload }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)

      return forward(request, h, {
        path: '/api/projects',
        method: 'POST',
        body: request.payload
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}',
    options: { validate: { params: projectSlugParams } },
    handler: (request, h) => forward(request, h, { path: projectPath(request) })
  },
  {
    method: 'PUT',
    path: '/api/projects/{slug}',
    options: {
      validate: {
        params: projectSlugParams,
        payload: projectUpdatePayload
      }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      const { slug } = request.params

      return forward(request, h, {
        path: `/api/projects/${encodeURIComponent(slug)}`,
        method: 'PUT',
        body: request.payload
      })
    }
  },
  {
    method: 'DELETE',
    path: '/api/projects/{slug}',
    options: {
      validate: { params: projectSlugParams }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      const { slug } = request.params

      return forward(request, h, {
        path: `/api/projects/${encodeURIComponent(slug)}`,
        method: 'DELETE'
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/payloads',
    options: {
      validate: { params: projectSlugParams, query: projectPayloadsQuery }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: `${projectPath(request)}/payloads`,
        query: windowQuery(request)
      })
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/sprints',
    options: {
      validate: { params: projectSlugParams, query: projectSprintsQuery }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: `${projectPath(request)}/sprints`,
        query: { count: request.query.count }
      })
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/delivery-metrics',
    options: {
      validate: { params: projectSlugParams, query: projectPayloadsQuery }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: `${projectPath(request)}/delivery-metrics`,
        query: windowQuery(request)
      })
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/leverage-v2',
    options: {
      validate: { params: projectSlugParams, query: leverageQuery }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: `${projectPath(request)}/leverage-v2`,
        query: { ...windowQuery(request), repository: request.query.repository }
      })
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/ai-native-leverage',
    options: {
      validate: { params: projectSlugParams, query: projectPayloadsQuery }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: `${projectPath(request)}/ai-native-leverage`,
        query: windowQuery(request)
      })
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/churn',
    options: {
      validate: { params: projectSlugParams, query: projectChurnQuery }
    },
    handler: (request, h) =>
      forward(request, h, {
        path: `${projectPath(request)}/churn`,
        query: {
          windowDays: request.query.windowDays,
          ...windowQuery(request)
        }
      })
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/jira-issues',
    options: { validate: { params: projectSlugParams } },
    handler: (request, h) =>
      forward(request, h, { path: `${projectPath(request)}/jira-issues` })
  },
  {
    method: 'POST',
    path: '/api/projects/{slug}/jira/sync',
    options: {
      validate: {
        params: projectSlugParams
      }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      const { slug } = request.params

      return forward(request, h, {
        path: `/api/projects/${encodeURIComponent(slug)}/jira/sync`,
        method: 'POST'
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/complexity-model',
    options: { validate: { params: projectSlugParams } },
    handler: (request, h) =>
      forward(request, h, { path: `${projectPath(request)}/complexity-model` })
  },
  {
    method: 'PUT',
    path: '/api/projects/{slug}/complexity-model',
    options: {
      validate: { params: projectSlugParams, payload: complexityModelPayload }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      const { slug } = request.params
      return forward(request, h, {
        path: `/api/projects/${encodeURIComponent(slug)}/complexity-model`,
        method: 'PUT',
        body: request.payload
      })
    }
  },
  {
    method: 'POST',
    path: '/api/admin/complexity/recompute',
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      return forward(request, h, {
        path: '/api/admin/complexity/recompute',
        method: 'POST'
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/pr-links/{repository}/{prNumber}',
    options: { validate: { params: prLinkParams } },
    handler: (request, h) => {
      const { repository, prNumber } = request.params
      return forward(request, h, {
        path: `${projectPath(request)}/pr-links/${encodeURIComponent(repository)}/${prNumber}`
      })
    }
  },
  {
    method: 'PUT',
    path: '/api/projects/{slug}/pr-links/{repository}/{prNumber}',
    options: {
      validate: { params: prLinkParams, payload: prLinkPayload }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      const { slug, repository, prNumber } = request.params
      return forward(request, h, {
        path: `/api/projects/${encodeURIComponent(slug)}/pr-links/${encodeURIComponent(repository)}/${prNumber}`,
        method: 'PUT',
        body: request.payload
      })
    }
  },
  {
    method: 'GET',
    path: '/api/repositories',
    handler: (request, h) => forward(request, h, { path: '/api/repositories' })
  },
  {
    method: 'GET',
    path: '/api/repositories/unassigned',
    handler: (request, h) =>
      forward(request, h, { path: '/api/repositories/unassigned' })
  },
  {
    method: 'PUT',
    path: '/api/repositories/{fullName}',
    options: {
      validate: {
        params: repositoryFullNameParams,
        payload: repositoryMapPayload
      }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      const { fullName } = request.params

      return forward(request, h, {
        path: `/api/repositories/${encodeURIComponent(fullName)}`,
        method: 'PUT',
        body: { projectSlug: request.payload.projectSlug }
      })
    }
  },
  {
    method: 'PUT',
    path: '/api/repositories/{fullName}/sonar-key',
    options: {
      validate: {
        params: repositoryFullNameParams,
        payload: repositorySonarKeyPayload
      }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      const { fullName } = request.params

      return forward(request, h, {
        path: `/api/repositories/${encodeURIComponent(fullName)}/sonar-key`,
        method: 'PUT',
        body: { sonarProjectKey: request.payload.sonarProjectKey }
      })
    }
  },
  {
    method: 'DELETE',
    path: '/api/repositories/{fullName}',
    options: {
      validate: { params: repositoryFullNameParams }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      const { fullName } = request.params

      return forward(request, h, {
        path: `/api/repositories/${encodeURIComponent(fullName)}`,
        method: 'DELETE'
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/audit-logs',
    options: {
      validate: { params: projectSlugParams, query: auditLogQuery }
    },
    handler: (request, h) => {
      const { from, to, page, pageSize } = request.query

      return forward(request, h, {
        path: `${projectPath(request)}/audit-logs`,
        query: {
          from: from?.toISOString(),
          to: to?.toISOString(),
          page,
          pageSize
        }
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/persona-mappings',
    options: { validate: { params: projectSlugParams } },
    handler: (request, h) =>
      forward(request, h, { path: `${projectPath(request)}/persona-mappings` })
  },
  {
    method: 'PUT',
    path: '/api/projects/{slug}/persona-mappings/{githubHandle}',
    options: {
      validate: {
        params: projectSlugParams.concat(githubHandleParams),
        payload: personaMappingPayload
      }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      const { githubHandle } = request.params

      return forward(request, h, {
        path: `${projectPath(request)}/persona-mappings/${encodeURIComponent(githubHandle)}`,
        method: 'PUT',
        body: request.payload
      })
    }
  },
  {
    method: 'DELETE',
    path: '/api/projects/{slug}/persona-mappings/{githubHandle}',
    options: {
      validate: { params: projectSlugParams.concat(githubHandleParams) }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      const { githubHandle } = request.params

      return forward(request, h, {
        path: `${projectPath(request)}/persona-mappings/${encodeURIComponent(githubHandle)}`,
        method: 'DELETE'
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/jira/workflow',
    options: { validate: { params: projectSlugParams } },
    handler: (request, h) =>
      forward(request, h, { path: `${projectPath(request)}/jira/workflow` })
  },
  {
    method: 'PUT',
    path: '/api/projects/{slug}/jira/workflow',
    options: {
      payload: jiraWorkflowWrite,
      validate: { params: projectSlugParams, payload: jiraWorkflowPayload }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      return forward(request, h, {
        path: `${projectPath(request)}/jira/workflow`,
        method: 'PUT',
        body: request.payload
      })
    }
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/jira/statuses',
    options: { validate: { params: projectSlugParams } },
    handler: (request, h) =>
      forward(request, h, { path: `${projectPath(request)}/jira/statuses` })
  },
  {
    method: 'GET',
    path: '/api/role-mappings',
    options: { validate: { query: roleMappingListQuery } },
    handler: (request, h) => {
      assertAdmin(request)
      return forward(request, h, {
        path: '/api/role-mappings',
        query: { projectSlug: request.query.projectSlug }
      })
    }
  },
  {
    method: 'POST',
    path: '/api/role-mappings',
    options: {
      payload: roleMappingWrite,
      validate: { payload: roleMappingCreatePayload }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      return forward(request, h, {
        path: '/api/role-mappings',
        method: 'POST',
        body: request.payload
      })
    }
  },
  {
    method: 'PATCH',
    path: '/api/role-mappings/{id}',
    options: {
      payload: roleMappingWrite,
      validate: {
        params: roleMappingIdParams,
        payload: roleMappingUpdatePayload
      }
    },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      return forward(request, h, {
        path: `/api/role-mappings/${encodeURIComponent(request.params.id)}`,
        method: 'PATCH',
        body: request.payload
      })
    }
  },
  {
    method: 'DELETE',
    path: '/api/role-mappings/{id}',
    options: { validate: { params: roleMappingIdParams } },
    handler: (request, h) => {
      verifyCsrf(request)
      assertAdmin(request)
      return forward(request, h, {
        path: `/api/role-mappings/${encodeURIComponent(request.params.id)}`,
        method: 'DELETE'
      })
    }
  }
]
