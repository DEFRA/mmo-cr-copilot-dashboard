import Joi from 'joi'

import { backendRequest } from '#/server/common/helpers/backend-client.js'

/**
 * Allow-listed proxy to mmo-cr-copilot-backend. Mostly read-only, plus
 * mutation routes for the Settings page's persona mapping (still validated
 * and path-built server-side, never a passthrough).
 *
 * Each route builds the backend path itself and forwards only validated
 * parameters, so a browser can never steer a request at an arbitrary upstream
 * path or host. The backend therefore stays internal to the platform and the
 * browser only ever talks to this origin — no CORS, no public backend URL, and
 * no backend credentials in the bundle.
 */

const forward = (request, h, { path, query, method = 'GET', body }) =>
  backendRequest({ path, query, method, body, logger: request.logger }).then(
    ({ statusCode, payload }) => h.response(payload).code(statusCode)
  )

const repositoryQuery = Joi.object({
  repository: Joi.string().min(1).max(512).required()
})

const githubHandleParams = Joi.object({
  githubHandle: Joi.string().min(1).max(39).required()
})

const personaMappingPayload = Joi.object({
  persona: Joi.string().valid('developer', 'devops', 'qa').required()
})

const commitClassificationParams = Joi.object({
  repository: Joi.string().min(1).max(512).required(),
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

export const apiProxyRoutes = [
  {
    method: 'GET',
    path: '/api/payloads',
    handler: (request, h) => forward(request, h, { path: '/api/payloads' })
  },
  {
    method: 'GET',
    path: '/api/payloads/{repository}/{prNumber}',
    options: {
      validate: {
        params: Joi.object({
          repository: Joi.string().min(1).max(512).required(),
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
    handler: (request, h) =>
      forward(request, h, { path: '/api/sonar/overview' })
  },
  {
    method: 'GET',
    path: '/api/sonar/repo',
    options: { validate: { query: repositoryQuery } },
    handler: (request, h) =>
      forward(request, h, {
        path: '/api/sonar/repo',
        query: { repository: request.query.repository }
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
    path: '/api/persona-mappings',
    handler: (request, h) =>
      forward(request, h, { path: '/api/persona-mappings' })
  },
  {
    method: 'PUT',
    path: '/api/persona-mappings/{githubHandle}',
    options: {
      validate: {
        params: githubHandleParams,
        payload: personaMappingPayload
      }
    },
    handler: (request, h) => {
      const { githubHandle } = request.params

      return forward(request, h, {
        path: `/api/persona-mappings/${encodeURIComponent(githubHandle)}`,
        method: 'PUT',
        body: request.payload
      })
    }
  },
  {
    method: 'DELETE',
    path: '/api/persona-mappings/{githubHandle}',
    options: {
      validate: { params: githubHandleParams }
    },
    handler: (request, h) => {
      const { githubHandle } = request.params

      return forward(request, h, {
        path: `/api/persona-mappings/${encodeURIComponent(githubHandle)}`,
        method: 'DELETE'
      })
    }
  }
]
