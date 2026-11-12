import {
  ApiError,
  CONFLICT,
  FORBIDDEN,
  NOT_FOUND,
  NO_JIRA_KEY,
  SLUG_TAKEN,
  SONAR_KEY_TAKEN,
  UNAVAILABLE,
  VALIDATION_FAILED,
  checkedWrite,
  ensureOk,
  readApiError,
  toApiError
} from './api-errors.js'

const boom = (status, message) =>
  new Response(
    JSON.stringify({ statusCode: status, error: 'Error', message }),
    {
      status
    }
  )

describe('#readApiError', () => {
  test('Should use the body message of a 4xx', async () => {
    const error = await readApiError(
      boom(400, 'Done needs at least one status')
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe('Done needs at least one status')
    expect(error.field).toBeNull()
  })

  test.each([
    'Invalid request input',
    'Invalid request payload input',
    'Invalid request params input',
    'Invalid request query input'
  ])('Should replace the generic %j with a friendly message', async (msg) => {
    const error = await readApiError(boom(400, msg))

    expect(error.message).toBe(VALIDATION_FAILED)
  })

  test.each([
    [400, VALIDATION_FAILED],
    [403, FORBIDDEN],
    [404, NOT_FOUND],
    [409, CONFLICT],
    [422, VALIDATION_FAILED],
    [418, UNAVAILABLE]
  ])(
    'Should fall back by status for an empty %i body',
    async (status, text) => {
      const error = await readApiError(new Response('', { status }))

      expect(error.status).toBe(status)
      expect(error.message).toBe(text)
    }
  )

  test('Should fall back for a non-JSON body', async () => {
    const res = new Response('<html>Bad gateway</html>', { status: 409 })

    expect((await readApiError(res)).message).toBe(CONFLICT)
  })

  test('Should ignore a body message that is not a string', async () => {
    const res = new Response(JSON.stringify({ message: 42 }), { status: 400 })

    expect((await readApiError(res)).message).toBe(VALIDATION_FAILED)
  })

  test.each([
    ['whitespace only', JSON.stringify({ message: '   ' })],
    ['a JSON null', 'null'],
    ['a JSON array', '[]']
  ])('Should fall back when the body message is %s', async (_, body) => {
    const error = await readApiError(new Response(body, { status: 409 }))

    expect(error.message).toBe(CONFLICT)
  })

  test('Should show the backend wording of a workflow 409', async () => {
    const message =
      'The Jira workflow was changed by someone else. Reload to see the latest version.'

    const error = await readApiError(boom(409, message), {
      context: 'jiraWorkflow'
    })

    expect(error.message).toBe(message)
    expect(error.field).toBeNull()
  })

  test('Should trim the body message', async () => {
    const error = await readApiError(boom(400, '  Done needs a status  '))

    expect(error.message).toBe('Done needs a status')
  })

  test('Should not map a known message sent with a 5xx', async () => {
    const error = await readApiError(
      boom(500, 'That project slug is already in use'),
      { context: 'project' }
    )

    expect(error.field).toBeNull()
    expect(error.message).toBe(UNAVAILABLE)
  })

  test.each([500, 502, 503])(
    'Should never show the body of a %i',
    async (status) => {
      const res = boom(status, 'MongoServerError at mongodb://db:27017')

      const error = await readApiError(res, { fallback: 'Not saved' })

      expect(error.message).toBe('Not saved')
      expect((await readApiError(boom(status, 'x'))).message).toBe(UNAVAILABLE)
    }
  )

  test('Should always use the fixed text for a 403', async () => {
    const error = await readApiError(boom(403, 'Admin role required'))

    expect(error.message).toBe(FORBIDDEN)
  })

  test('Should use the context text for a 404', async () => {
    const error = await readApiError(boom(404, 'Project not found'), {
      notFound: 'That project no longer exists'
    })

    expect(error.message).toBe('That project no longer exists')
  })

  test.each([
    ['project', 409, 'That project slug is already in use', 'slug', SLUG_TAKEN],
    [
      'project',
      400,
      'AI-Native projects require exactly one Jira project key',
      'jiraKey',
      'AI-Native projects require exactly one Jira project key'
    ],
    [
      'project',
      400,
      'The Jira project key cannot be removed',
      'jiraKey',
      'The Jira project key cannot be removed'
    ],
    [
      'project',
      409,
      'The Jira project key was changed by someone else',
      null,
      CONFLICT
    ],
    [
      'sonarKey',
      409,
      'That SonarCloud project key is already in use',
      'sonarProjectKey',
      SONAR_KEY_TAKEN
    ],
    ['jiraWorkflow', 422, 'Project has no Jira project key', null, NO_JIRA_KEY]
  ])(
    'Should map a known %s %i to its field',
    async (context, status, message, field, text) => {
      const error = await readApiError(boom(status, message), { context })

      expect(error.field).toBe(field ?? null)
      expect(error.message).toBe(text)
    }
  )

  test('Should not map a known message outside its context', async () => {
    const error = await readApiError(
      boom(409, 'That project slug is already in use'),
      { context: 'sonarKey' }
    )

    expect(error.field).toBeNull()
    expect(error.message).toBe('That project slug is already in use')
  })

  test('Should not map a known message with a different status', async () => {
    const error = await readApiError(
      boom(400, 'That project slug is already in use'),
      { context: 'project' }
    )

    expect(error.field).toBeNull()
  })
})

describe('#toApiError', () => {
  test('Should keep an ApiError', () => {
    const error = new ApiError({ status: 409, message: 'Taken', field: 'slug' })

    expect(toApiError(error)).toBe(error)
  })

  test('Should turn a network failure into the fallback', () => {
    const error = toApiError(new TypeError('Failed to fetch'), 'Not saved')

    expect(error.status).toBe(0)
    expect(error.message).toBe('Not saved')
    expect(toApiError(new Error('x')).message).toBe(UNAVAILABLE)
  })
})

describe('#ensureOk', () => {
  test('Should return a successful response', async () => {
    const res = new Response('{}', { status: 200 })

    expect(await ensureOk(res)).toBe(res)
  })

  test('Should throw the read error for a failed response', async () => {
    await expect(
      ensureOk(boom(409, 'That project slug is already in use'), {
        context: 'project'
      })
    ).rejects.toMatchObject({ status: 409, field: 'slug', message: SLUG_TAKEN })
  })
})

describe('#checkedWrite', () => {
  test('Should return the response of a successful write', async () => {
    const res = new Response('{}', { status: 200 })

    expect(await checkedWrite(Promise.resolve(res))).toBe(res)
  })

  test('Should throw the mapped error for a refused write', async () => {
    await expect(
      checkedWrite(
        Promise.resolve(boom(409, 'That project slug is already in use')),
        {
          context: 'project'
        }
      )
    ).rejects.toMatchObject({ status: 409, field: 'slug', message: SLUG_TAKEN })
  })

  test('Should turn a network failure into the fallback', async () => {
    await expect(
      checkedWrite(Promise.reject(new TypeError('Failed to fetch')), {
        fallback: 'Not saved'
      })
    ).rejects.toMatchObject({ status: 0, message: 'Not saved' })
  })
})
