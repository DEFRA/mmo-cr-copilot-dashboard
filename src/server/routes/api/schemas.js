import Joi from 'joi'

// Input limits mirror the backend's schemas; the backend still validates everything.
const LIMITS = {
  repository: 512,
  githubHandle: 100,
  auditPageSize: 200,
  prJiraKeys: 20,
  lineCap: 100000,
  fileCap: 10000,
  moduleCap: 1000,
  hardCapLines: 1000000,
  hardCapFiles: 100000,
  sprintCount: 50,
  churnWindowDays: 90,
  defaultChurnWindowDays: 21,
  sonarKey: 255,
  sprintLengthDays: 30,
  projectName: 200,
  groupName: 256,
  description: 500,
  roleMappingIdLength: 24,
  workflowStatus: 60,
  statusesPerStage: 40,
  minWorkflowStages: 2
}

const MAX_BYTES = { roleMapping: 4096, jiraWorkflow: 32768 }
const JSON_ONLY = 'application/json'

// A '.' or '..' segment would be resolved by the backend as a relative path.
const DOT_SEGMENT = /(^|\/)\.{1,2}(\/|$)/
// Control characters are exactly what these patterns reject.
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001f\u007f]+$/
const isoDate = () => Joi.date().iso().optional()
const positiveInteger = () => Joi.number().integer().min(1)

export const repositoryParam = Joi.string()
  .min(1)
  .max(LIMITS.repository)
  .custom((value, helpers) =>
    DOT_SEGMENT.test(value)
      ? helpers.message('{{#label}} must not contain a . or .. segment')
      : value
  )

export const repositoryQuery = Joi.object({
  repository: Joi.string().min(1).max(LIMITS.repository).required(),
  asOf: isoDate()
})

// The git config author name; free text except slashes, dot segments and control characters.
export const githubHandleParams = Joi.object({
  githubHandle: Joi.string()
    .max(LIMITS.githubHandle)
    .pattern(/^(?!\.{1,2}$)(?!\s)(?!.*\s$)[^/\\\p{Cc}]+$/u)
    .required()
})

export const personaMappingPayload = Joi.object({
  persona: Joi.string().valid('developer', 'devops', 'qa').required()
})

export const commitClassificationParams = Joi.object({
  repository: repositoryParam.required(),
  prNumber: positiveInteger().required(),
  commit: Joi.string()
    .pattern(/^[\da-f]{7,64}$/i)
    .required()
})

export const commitClassificationPayload = Joi.object({
  classification: Joi.string()
    .valid('Copilot-assisted', 'Human-authored', 'Rebase', 'Dependabot')
    .required()
})

export const auditLogQuery = Joi.object({
  from: isoDate(),
  to: Joi.date().iso().greater(Joi.ref('from')).optional(),
  page: positiveInteger().optional(),
  pageSize: positiveInteger().max(LIMITS.auditPageSize).optional()
})

// Project slugs are 3-4 uppercase characters, for example CRAR or FES.
const PROJECT_SLUG_PATTERN = /^[A-Z][A-Z0-9]{2,3}$/
const projectSlug = Joi.string().pattern(PROJECT_SLUG_PATTERN)

export const payloadParams = Joi.object({
  repository: repositoryParam.required(),
  prNumber: positiveInteger().required()
})

export const sonarOverviewQuery = Joi.object({
  asOf: isoDate(),
  project: projectSlug.optional()
})

export const sonarPrQuery = repositoryQuery.keys({
  prNumber: positiveInteger().required()
})

export const projectSlugParams = Joi.object({
  slug: projectSlug.required()
})

export const prLinkParams = projectSlugParams.keys({
  repository: repositoryParam.required(),
  prNumber: positiveInteger().required()
})

export const prLinkPayload = Joi.object({
  jiraKeys: Joi.array()
    .items(Joi.string().pattern(/^[A-Z][A-Z0-9_]+-\d+$/))
    .max(LIMITS.prJiraKeys)
    .unique()
    .required()
})

const modelWeight = Joi.number().min(0).max(1).required()
const cap = (max) => positiveInteger().max(max).required()

export const complexityModelPayload = Joi.object({
  lineCap: cap(LIMITS.lineCap),
  fileCap: cap(LIMITS.fileCap),
  moduleCap: cap(LIMITS.moduleCap),
  weights: Joi.object({
    lines: modelWeight,
    files: modelWeight,
    modules: modelWeight
  }).required(),
  hardCapLines: cap(LIMITS.hardCapLines),
  hardCapFiles: cap(LIMITS.hardCapFiles)
}).options({ stripUnknown: true })

export const projectPayloadsQuery = Joi.object({
  from: isoDate(),
  to: isoDate()
})

export const leverageQuery = projectPayloadsQuery.keys({
  repository: Joi.string().min(1).max(LIMITS.repository).optional()
})

export const projectSprintsQuery = Joi.object({
  count: positiveInteger().max(LIMITS.sprintCount).optional()
})

export const projectChurnQuery = Joi.object({
  windowDays: positiveInteger()
    .max(LIMITS.churnWindowDays)
    .default(LIMITS.defaultChurnWindowDays),
  from: isoDate(),
  to: isoDate()
}).unknown()

export const repositoryFullNameParams = Joi.object({
  fullName: repositoryParam.pattern(/^[\w.-]+\/[\w.-]+$/).required()
})

// The SonarCloud key is set only through the sonar-key route.
export const repositoryMapPayload = Joi.object({
  projectSlug: projectSlug.required()
}).options({ stripUnknown: true })

export const repositorySonarKeyPayload = Joi.object({
  sonarProjectKey: Joi.string()
    .trim()
    .pattern(/^[\w.:-]+$/)
    .max(LIMITS.sonarKey)
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
  cadenceDays: positiveInteger().max(LIMITS.sprintLengthDays),
  anchorDate: Joi.date().iso()
}).options({ stripUnknown: true })

export const sprintCalendarWrite = sprintCalendarPayload.fork(
  ['cadenceDays', 'anchorDate'],
  (field) => field.required()
)

const projectName = Joi.string().min(1).max(LIMITS.projectName)
const projectType = Joi.string().valid('ai-adopted', 'ai-native')

export const projectCreatePayload = Joi.object({
  slug: projectSlug.required(),
  name: projectName.required(),
  type: projectType.required(),
  adoptionStartDate: isoDate(),
  sprintCalendar: sprintCalendarPayload.optional(),
  jira: projectJiraPayload.optional()
}).options({ stripUnknown: true })

export const projectUpdatePayload = Joi.object({
  name: projectName.optional(),
  type: projectType.optional(),
  adoptionStartDate: Joi.date().iso().allow(null).optional(),
  sprintCalendar: sprintCalendarPayload.optional(),
  jira: projectJiraPayload.optional()
}).options({ stripUnknown: true })

const ROLE_MAPPING_ROLES = ['Dashboard.Admin', 'project-admin', 'project-user']

// The group name is exactly what Entra emits in the groups claim: never rewritten.
const groupName = Joi.string()
  .trim()
  .min(1)
  .max(LIMITS.groupName)
  .pattern(NO_CONTROL_CHARACTERS)

export const roleMappingIdParams = Joi.object({
  id: Joi.string().hex().length(LIMITS.roleMappingIdLength).required()
})

export const roleMappingListQuery = Joi.object({
  projectSlug: projectSlug.optional()
})

const description = Joi.string().allow('').max(LIMITS.description)

export const roleMappingCreatePayload = Joi.object({
  groupName: groupName.required(),
  role: Joi.string()
    .valid(...ROLE_MAPPING_ROLES)
    .required(),
  projectSlug: projectSlug.allow(null).optional(),
  description: description.optional()
})

export const roleMappingUpdatePayload = Joi.object({
  role: Joi.string().valid(...ROLE_MAPPING_ROLES),
  projectSlug: projectSlug.allow(null),
  description
}).min(1)

export const roleMappingWrite = {
  maxBytes: MAX_BYTES.roleMapping,
  allow: JSON_ONLY
}

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
  .max(LIMITS.workflowStatus)
  .pattern(NO_CONTROL_CHARACTERS)

// Shape only: the backend owns the cross-stage rules (required stages, duplicates, totals).
export const jiraWorkflowPayload = Joi.object({
  version: Joi.number().integer().min(0).required(),
  stages: Joi.array()
    .items(
      Joi.object({
        id: Joi.string()
          .valid(...WORKFLOW_STAGE_IDS)
          .required(),
        statuses: Joi.array()
          .items(workflowStatus)
          .max(LIMITS.statusesPerStage)
          .required()
      }).options({ stripUnknown: true })
    )
    .min(LIMITS.minWorkflowStages)
    .max(WORKFLOW_STAGE_IDS.length)
    .unique('id')
    .required()
}).options({ stripUnknown: true })

export const jiraWorkflowWrite = {
  maxBytes: MAX_BYTES.jiraWorkflow,
  allow: JSON_ONLY
}
