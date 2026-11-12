import {
  auditQuery,
  forward,
  forwardWrite,
  projectPath,
  windowQuery
} from './proxy.js'
import {
  complexityModelPayload,
  githubHandleParams,
  jiraWorkflowPayload,
  jiraWorkflowWrite,
  leverageQuery,
  personaMappingPayload,
  prLinkParams,
  prLinkPayload,
  projectChurnQuery,
  projectPayloadsQuery,
  projectSlugParams,
  projectSprintsQuery,
  projectUpdatePayload,
  sprintCalendarWrite,
  auditLogQuery
} from './schemas.js'

// A read of `/api/projects/{slug}/<suffix>`, optionally with a query built from the request.
const projectRead = (suffix, { query, toQuery } = {}) => ({
  method: 'GET',
  path: `/api/projects/{slug}${suffix}`,
  options: {
    validate: { params: projectSlugParams, ...(query && { query }) }
  },
  handler: (request, h) =>
    forward(request, h, {
      path: `${projectPath(request)}${suffix}`,
      ...(toQuery && { query: toQuery(request) })
    })
})

const personaParams = projectSlugParams.concat(githubHandleParams)
const personaPath = (request) =>
  `${projectPath(request)}/persona-mappings/${encodeURIComponent(request.params.githubHandle)}`
const prLinkPath = (request) =>
  `${projectPath(request)}/pr-links/${encodeURIComponent(request.params.repository)}/${request.params.prNumber}`

/** Per-project proxy routes; each builds its own upstream path from validated params. */
export const projectProxyRoutes = [
  projectRead(''),
  {
    method: 'PUT',
    path: '/api/projects/{slug}',
    options: {
      validate: { params: projectSlugParams, payload: projectUpdatePayload }
    },
    handler: (request, h) =>
      forwardWrite(
        request,
        h,
        { path: projectPath(request), body: request.payload },
        { admin: true }
      )
  },
  {
    method: 'DELETE',
    path: '/api/projects/{slug}',
    options: { validate: { params: projectSlugParams } },
    handler: (request, h) =>
      forwardWrite(request, h, { path: projectPath(request) }, { admin: true })
  },
  projectRead('/payloads', {
    query: projectPayloadsQuery,
    toQuery: windowQuery
  }),
  projectRead('/sprints', {
    query: projectSprintsQuery,
    toQuery: (request) => ({ count: request.query.count })
  }),
  projectRead('/delivery-metrics', {
    query: projectPayloadsQuery,
    toQuery: windowQuery
  }),
  projectRead('/leverage-v2', {
    query: leverageQuery,
    toQuery: (request) => ({
      ...windowQuery(request),
      repository: request.query.repository
    })
  }),
  projectRead('/ai-native-leverage', {
    query: projectPayloadsQuery,
    toQuery: windowQuery
  }),
  projectRead('/churn', {
    query: projectChurnQuery,
    toQuery: (request) => ({
      windowDays: request.query.windowDays,
      ...windowQuery(request)
    })
  }),
  projectRead('/jira-issues'),
  projectRead('/complexity-model'),
  {
    method: 'PUT',
    path: '/api/projects/{slug}/complexity-model',
    options: {
      validate: { params: projectSlugParams, payload: complexityModelPayload }
    },
    handler: (request, h) =>
      forwardWrite(
        request,
        h,
        {
          path: `${projectPath(request)}/complexity-model`,
          body: request.payload
        },
        { admin: true }
      )
  },
  {
    method: 'GET',
    path: '/api/projects/{slug}/pr-links/{repository}/{prNumber}',
    options: { validate: { params: prLinkParams } },
    handler: (request, h) => forward(request, h, { path: prLinkPath(request) })
  },
  {
    method: 'PUT',
    path: '/api/projects/{slug}/pr-links/{repository}/{prNumber}',
    options: {
      validate: { params: prLinkParams, payload: prLinkPayload }
    },
    handler: (request, h) =>
      forwardWrite(request, h, {
        path: prLinkPath(request),
        body: request.payload
      })
  },
  projectRead('/audit-logs', { query: auditLogQuery, toQuery: auditQuery }),
  projectRead('/persona-mappings'),
  {
    method: 'PUT',
    path: '/api/projects/{slug}/persona-mappings/{githubHandle}',
    options: {
      validate: { params: personaParams, payload: personaMappingPayload }
    },
    handler: (request, h) =>
      forwardWrite(request, h, {
        path: personaPath(request),
        body: request.payload
      })
  },
  {
    method: 'DELETE',
    path: '/api/projects/{slug}/persona-mappings/{githubHandle}',
    options: { validate: { params: personaParams } },
    handler: (request, h) =>
      forwardWrite(request, h, { path: personaPath(request) })
  },
  projectRead('/jira/workflow'),
  {
    method: 'PUT',
    path: '/api/projects/{slug}/jira/workflow',
    options: {
      payload: jiraWorkflowWrite,
      validate: { params: projectSlugParams, payload: jiraWorkflowPayload }
    },
    handler: (request, h) =>
      forwardWrite(request, h, {
        path: `${projectPath(request)}/jira/workflow`,
        body: request.payload
      })
  },
  projectRead('/jira/statuses'),
  {
    method: 'PUT',
    path: '/api/projects/{slug}/sprint-calendar',
    options: {
      validate: { params: projectSlugParams, payload: sprintCalendarWrite }
    },
    handler: (request, h) =>
      forwardWrite(request, h, {
        path: `${projectPath(request)}/sprint-calendar`,
        body: request.payload
      })
  }
]
