import { apiFetch, apiUrl, jsonWrite } from './api.js'

describe('#apiUrl', () => {
  test('Should leave an absolute path unchanged', () => {
    expect(apiUrl('/api/payloads')).toBe('/api/payloads')
  })

  test('Should make a relative path root relative', () => {
    expect(apiUrl('api/payloads')).toBe('/api/payloads')
  })

  test('Should never produce a cross-origin URL', () => {
    expect(apiUrl('/api/sonar/overview').startsWith('/')).toBe(true)
  })
})

describe('#jsonWrite', () => {
  test('Should send the CSRF header and a JSON body', async () => {
    fetchMock.mockResponse('{}')

    await jsonWrite('/api/projects', 'POST', { name: 'One' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/projects')
    expect(init.method).toBe('POST')
    expect(init.headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"name":"One"}')
  })

  test('Should send no body for a delete', async () => {
    fetchMock.mockResponse('')

    await jsonWrite('/api/persona-mappings/ada', 'DELETE')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBeUndefined()
    expect(init.headers['x-requested-with']).toBe('XMLHttpRequest')
  })
})

describe('#apiFetch', () => {
  const { location } = window

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/projects/CRAR',
        search: '?a=1',
        hash: '',
        assign: vi.fn()
      }
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location
    })
  })

  test('Should send the user to sign in once when the session has ended', async () => {
    fetchMock.mockResponse('{}', { status: 401 })

    const first = await apiFetch('/api/projects')
    await apiFetch('/api/projects')

    expect(first.status).toBe(401)
    expect(window.location.assign).toHaveBeenCalledTimes(1)
    expect(window.location.assign).toHaveBeenCalledWith(
      '/login?returnTo=%2Fprojects%2FCRAR%3Fa%3D1'
    )
  })

  test('Should leave other statuses alone', async () => {
    fetchMock.mockResponse('{}', { status: 500 })

    await apiFetch('/api/projects')

    expect(window.location.assign).not.toHaveBeenCalled()
  })
})
