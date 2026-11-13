import { projectProxyRoutes } from './project-routes.js'
import { assertAdmin, auditQuery, forward, forwardWrite } from './proxy.js'
import {
  auditLogQuery,
  commitClassificationParams,
  commitClassificationPayload,
  payloadParams,
  projectCreatePayload,
  repositoryFullNameParams,
  repositoryMapPayload,
  repositoryQuery,
  repositorySonarKeyPayload,
  roleMappingCreatePayload,
  roleMappingIdParams,
  roleMappingListQuery,
  roleMappingUpdatePayload,
  roleMappingWrite,
  sonarOverviewQuery,
  sonarPrQuery
} from './schemas.js'

export { assertAdmin, verifyCsrf } from './proxy.js'

const ROLE_MAPPINGS_PATH = '/api/role-mappings'
const PROJECTS_PATH = '/api/projects'
const repositoryPath = (request) =>
  `/api/repositories/${encodeURIComponent(request.params.fullName)}`
const roleMappingPath = (request) =>
  `${ROLE_MAPPINGS_PATH}/${encodeURIComponent(request.params.id)}`
const isoOrNothing = (date) => date?.toISOString()

const sharedProxyRoutes = [
  {
    method: 'GET',
    path: '/api/payloads/{repository}/{prNumber}',
    options: { validate: { params: payloadParams } },
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
      return forwardWrite(request, h, {
        path: `/api/payloads/${encodeURIComponent(repository)}/${prNumber}/commits/${encodeURIComponent(commit)}`,
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
      return forward(request, h, {
        path: '/api/audit-logs',
        query: auditQuery(request)
      })
    }
  },
  {
    method: 'GET',
    path: '/api/sonar/overview',
    options: { validate: { query: sonarOverviewQuery } },
    handler: (request, h) => {
      const { asOf, project } = request.query
      const query = {
        ...(asOf && { asOf: asOf.toISOString() }),
        ...(project && { project })
      }
      return forward(request, h, {
        path: '/api/sonar/overview',
        query: Object.keys(query).length > 0 ? query : undefined
      })
    }
  },
  {
    method: 'GET',
    path: '/api/sonar/repo',
    options: { validate: { query: repositoryQuery } },
    handler: (request, h) => {
      const asOf = isoOrNothing(request.query.asOf)
      return forward(request, h, {
        path: '/api/sonar/repo',
        query: {
          repository: request.query.repository,
          ...(asOf && { asOf })
        }
      })
    }
  },
  {
    method: 'GET',
    path: '/api/sonar/pr',
    options: { validate: { query: sonarPrQuery } },
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
    path: PROJECTS_PATH,
    handler: (request, h) => forward(request, h, { path: PROJECTS_PATH })
  },
  {
    method: 'POST',
    path: PROJECTS_PATH,
    options: { validate: { payload: projectCreatePayload } },
    handler: (request, h) =>
      forwardWrite(
        request,
        h,
        { path: PROJECTS_PATH, body: request.payload },
        { admin: true }
      )
  },
  {
    method: 'POST',
    path: '/api/admin/complexity/recompute',
    handler: (request, h) =>
      forwardWrite(
        request,
        h,
        { path: '/api/admin/complexity/recompute' },
        { admin: true }
      )
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
    handler: (request, h) =>
      forwardWrite(request, h, {
        path: repositoryPath(request),
        body: { projectSlug: request.payload.projectSlug }
      })
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
    handler: (request, h) =>
      forwardWrite(request, h, {
        path: `${repositoryPath(request)}/sonar-key`,
        body: { sonarProjectKey: request.payload.sonarProjectKey }
      })
  },
  {
    method: 'DELETE',
    path: '/api/repositories/{fullName}',
    options: { validate: { params: repositoryFullNameParams } },
    handler: (request, h) =>
      forwardWrite(request, h, { path: repositoryPath(request) })
  },
  {
    method: 'GET',
    path: ROLE_MAPPINGS_PATH,
    options: { validate: { query: roleMappingListQuery } },
    handler: (request, h) => {
      assertAdmin(request)
      return forward(request, h, {
        path: ROLE_MAPPINGS_PATH,
        query: { projectSlug: request.query.projectSlug }
      })
    }
  },
  {
    method: 'POST',
    path: ROLE_MAPPINGS_PATH,
    options: {
      payload: roleMappingWrite,
      validate: { payload: roleMappingCreatePayload }
    },
    handler: (request, h) =>
      forwardWrite(
        request,
        h,
        { path: ROLE_MAPPINGS_PATH, body: request.payload },
        { admin: true }
      )
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
    handler: (request, h) =>
      forwardWrite(
        request,
        h,
        { path: roleMappingPath(request), body: request.payload },
        { admin: true }
      )
  },
  {
    method: 'DELETE',
    path: '/api/role-mappings/{id}',
    options: { validate: { params: roleMappingIdParams } },
    handler: (request, h) =>
      forwardWrite(
        request,
        h,
        { path: roleMappingPath(request) },
        { admin: true }
      )
  }
]

/**
 * The BFF's allow-listed proxy routes. Each builds its own upstream path from
 * validated parameters; there is no catch-all.
 */
export const apiProxyRoutes = [...sharedProxyRoutes, ...projectProxyRoutes]
