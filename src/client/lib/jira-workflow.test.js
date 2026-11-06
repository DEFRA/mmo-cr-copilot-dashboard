import {
  MAX_STATUSES_PER_STAGE,
  MAX_STATUSES_TOTAL,
  STAGE_HINT,
  addStatusError,
  isWorkflowDirty,
  normaliseStatus,
  stageOf,
  statusOptions,
  tidyStatus,
  toWorkflow,
  toWorkflowPayload,
  validateWorkflow,
  workflowSourceText
} from './jira-workflow.js'

const stage = (id, label, kind, statuses, required = false) => ({
  id,
  label,
  kind,
  required,
  statuses
})

const STAGES = [
  stage('todo', 'To Do', 'todo', ['To Do', 'Backlog'], true),
  stage('in-progress', 'In Progress', 'active', ['In Dev']),
  stage('done', 'Done', 'done', ['Done'], true)
]

const RAW = {
  source: 'project',
  version: 3,
  updatedAt: '2026-11-05T10:00:00.000Z',
  updatedBy: { name: 'A Person', oid: 'secret' },
  detectedAt: null,
  detectedCount: 0,
  stages: STAGES,
  suggestions: { todo: ['Open'], done: 'not a list' }
}

describe('#normaliseStatus and #tidyStatus', () => {
  test('Should collapse spacing, and lower case only when normalising', () => {
    expect(tidyStatus('  In   Review ')).toBe('In Review')
    expect(normaliseStatus('  In   Review ')).toBe('in review')
    expect(tidyStatus(null)).toBe('')
  })
})

describe('#STAGE_HINT', () => {
  test('Should say how To Do and Done start and end a ticket', () => {
    expect(STAGE_HINT.todo).toContain(
      'A ticket starts when it first moves out of one of these statuses.'
    )
    expect(STAGE_HINT.done).toContain(
      'A ticket is delivered when it moves into one of these statuses.'
    )
  })
})

describe('#toWorkflow', () => {
  test('Should keep the known fields and drop anything else', () => {
    const workflow = toWorkflow(RAW)

    expect(workflow.updatedBy).toEqual({ name: 'A Person' })
    expect(workflow.suggestions).toEqual({ todo: ['Open'] })
    expect(workflow.stages[0]).toEqual(STAGES[0])
    expect(workflow.stages[0].statuses).not.toBe(STAGES[0].statuses)
  })

  test('Should default the optional fields', () => {
    const workflow = toWorkflow({
      source: 'default',
      version: 0,
      stages: STAGES,
      updatedAt: 'not a date'
    })

    expect(workflow).toMatchObject({
      updatedAt: null,
      updatedBy: null,
      detectedAt: null,
      detectedCount: 0,
      suggestions: {}
    })
  })

  test.each([
    ['nothing', null],
    ['an unknown source', { ...RAW, source: 'guess' }],
    ['a missing version', { ...RAW, version: undefined }],
    ['no stages', { ...RAW, stages: [] }],
    [
      'a stage of unknown kind',
      { ...RAW, stages: [{ ...STAGES[0], kind: 'x' }] }
    ],
    [
      'a stage with a non-text status',
      { ...RAW, stages: [{ ...STAGES[0], statuses: [1] }] }
    ]
  ])('Should refuse %s', (_, raw) => {
    expect(toWorkflow(raw)).toBeNull()
  })
})

describe('#workflowSourceText', () => {
  test('Should name who saved it and when', () => {
    expect(workflowSourceText(toWorkflow(RAW))).toBe(
      'Saved by A Person on 5 November 2026.'
    )
    expect(workflowSourceText({ source: 'project' })).toBe('Saved.')
  })

  test('Should say when it was detected from Jira', () => {
    expect(
      workflowSourceText({
        source: 'detected',
        detectedAt: '2026-11-04T08:00:00.000Z'
      })
    ).toBe('Detected from Jira on 4 November 2026. You can change it and save.')
    expect(workflowSourceText({ source: 'detected' })).toBe(
      'Detected from Jira. You can change it and save.'
    )
  })

  test('Should give the date in local time like the rest of the app', () => {
    const at = '2026-11-04T23:30:00.000Z'
    const local = new Date(at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    expect(workflowSourceText({ source: 'detected', detectedAt: at })).toBe(
      `Detected from Jira on ${local}. You can change it and save.`
    )
  })

  test('Should explain the standard statuses', () => {
    expect(workflowSourceText({ source: 'default' })).toBe(
      'Using the standard statuses. Run a Jira sync or save your own.'
    )
  })
})

describe('#stageOf', () => {
  test('Should match without case or spacing', () => {
    expect(stageOf(STAGES, '  in   DEV ').id).toBe('in-progress')
    expect(stageOf(STAGES, 'Funnel')).toBeNull()
  })
})

describe('#addStatusError', () => {
  test('Should accept a new status', () => {
    expect(addStatusError(STAGES, 'in-progress', 'Coding')).toBeNull()
  })

  test.each([
    ['', 'Enter a status'],
    ['   ', 'Enter a status'],
    ['s'.repeat(61), 'Status must be 60 characters or fewer'],
    [
      'To\u0007Do',
      'Status must only include letters, numbers, spaces and punctuation'
    ],
    ['in dev', '‘in dev’ is already in In Progress'],
    [
      ' BACKLOG ',
      '‘BACKLOG’ is already in To Do. A status can only be in one stage.'
    ]
  ])('Should refuse %j', (text, message) => {
    expect(addStatusError(STAGES, 'in-progress', text)).toBe(message)
  })

  test('Should cap the statuses in a stage', () => {
    const full = [
      stage(
        'todo',
        'To Do',
        'todo',
        Array.from({ length: MAX_STATUSES_PER_STAGE }, (_, i) => `S${i}`)
      )
    ]

    expect(addStatusError(full, 'todo', 'Another')).toBe(
      'To Do can have up to 40 statuses'
    )
  })

  test('Should cap the statuses in the workflow', () => {
    const many = Array.from({ length: 4 }, (_, n) =>
      stage(
        `s${n}`,
        `S${n}`,
        'active',
        Array.from({ length: 38 }, (_, i) => `${n}-${i}`)
      )
    )
    many.push(stage('empty', 'Empty', 'active', []))

    expect(addStatusError(many, 'empty', 'New one')).toBe(
      `A workflow can have at most ${MAX_STATUSES_TOTAL} statuses`
    )
  })
})

describe('#validateWorkflow', () => {
  test('Should pass when every required stage has a status', () => {
    expect(validateWorkflow(STAGES)).toEqual({})
  })

  test('Should name each empty required stage', () => {
    const empty = STAGES.map((s) => ({ ...s, statuses: [] }))

    expect(validateWorkflow(empty)).toEqual({
      todo: 'Add at least one status to To Do',
      done: 'Add at least one status to Done'
    })
  })
})

describe('#isWorkflowDirty', () => {
  test('Should ignore order and spacing', () => {
    const same = STAGES.map((s) => ({
      ...s,
      statuses: [...s.statuses].reverse().map((x) => ` ${x}  `)
    }))

    expect(isWorkflowDirty(same, STAGES)).toBe(false)
  })

  test('Should treat a change of case as a change', () => {
    const recased = STAGES.map((s) => ({
      ...s,
      statuses: s.statuses.map((x) => x.toUpperCase())
    }))

    expect(isWorkflowDirty(recased, STAGES)).toBe(true)
  })

  test('Should notice an added or removed status', () => {
    const added = STAGES.map((s) =>
      s.id === 'done' ? { ...s, statuses: [...s.statuses, 'Closed'] } : s
    )

    expect(isWorkflowDirty(added, STAGES)).toBe(true)
    expect(isWorkflowDirty(STAGES.slice(1), STAGES)).toBe(true)
    expect(isWorkflowDirty(STAGES, undefined)).toBe(true)
  })
})

describe('#toWorkflowPayload', () => {
  test('Should send only ids and statuses with the version', () => {
    expect(toWorkflowPayload(STAGES, 2)).toEqual({
      version: 2,
      stages: [
        { id: 'todo', statuses: ['To Do', 'Backlog'] },
        { id: 'in-progress', statuses: ['In Dev'] },
        { id: 'done', statuses: ['Done'] }
      ]
    })
  })
})

describe('#statusOptions', () => {
  test('Should put stage suggestions first and leave out used names', () => {
    const suggestions = { 'in-progress': ['In Dev', 'Coding', 'Doing'] }

    expect(
      statusOptions(STAGES, 'in-progress', suggestions, [
        'doing',
        'BACKLOG',
        'Funnel',
        ' ',
        'funnel'
      ])
    ).toEqual(['Coding', 'Doing', 'Funnel'])
  })

  test('Should cope with no suggestions', () => {
    expect(statusOptions(STAGES, 'blocked', undefined)).toEqual([])
  })
})
