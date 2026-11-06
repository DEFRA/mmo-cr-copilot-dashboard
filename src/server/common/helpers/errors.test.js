import { vi } from 'vitest'

import { catchAll, errorPageFor } from './errors.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../constants/status-codes.js'

describe('#errors', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected Not Found page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/non-existent-path'
    })

    expect(result).toEqual(
      expect.stringContaining('Page not found | mmo-cr-copilot-dashboard')
    )
    expect(statusCode).toBe(statusCodes.notFound)
  })

  test('Should render the harbour scene with its own stylesheet and a real heading', async () => {
    const { result } = await server.inject('/non-existent-path')

    expect(result).toContain('/public/error-page.css')
    expect(result).toContain('class="app-error app-error--lost"')
    expect(result).toContain('aria-hidden="true"')
    expect(result).toMatch(
      /<h1 class="app-error__heading">Page not found<\/h1>/
    )
    expect(result).not.toMatch(/<script/i)
  })
})

describe('#errorPageFor', () => {
  test.each([
    [statusCodes.unauthorized, 'locked', 'Sign-in did not complete', '/login'],
    [statusCodes.forbidden, 'locked', 'You do not have access yet', '/login'],
    [statusCodes.notFound, 'lost', 'Page not found', '/'],
    [statusCodes.badRequest, 'lost', 'That request did not make sense', '/'],
    [statusCodes.internalServerError, 'storm', 'Something went wrong', '/'],
    [statusCodes.imATeapot, 'storm', 'Something went wrong', '/']
  ])('Should describe %s as %s', (status, kind, heading, href) => {
    const page = errorPageFor(status)

    expect(page).toMatchObject({ kind, heading, primary: { href } })
  })

  test.each([statusCodes.unauthorized, statusCodes.forbidden])(
    'Should offer sign out alongside sign in for %s',
    (status) => {
      expect(errorPageFor(status).secondary).toEqual({
        href: '/logout',
        text: 'Sign out'
      })
    }
  )
})

describe('#catchAll', () => {
  const mockErrorLogger = vi.fn()
  const mockStack = 'Mock error stack'
  const errorPage = 'error/index'
  const mockRequest = (statusCode, path = '/some-page') => ({
    path,
    response: {
      isBoom: true,
      stack: mockStack,
      output: {
        statusCode,
        payload: {
          statusCode,
          error: 'Error',
          message: 'An upstream failure'
        }
      }
    },
    logger: { error: mockErrorLogger }
  })
  const mockToolkitView = vi.fn()
  const mockToolkitCode = vi.fn()
  const mockToolkit = {
    view: mockToolkitView.mockReturnThis(),
    code: mockToolkitCode.mockReturnThis()
  }

  test.each([
    statusCodes.badRequest,
    statusCodes.unauthorized,
    statusCodes.forbidden,
    statusCodes.notFound,
    statusCodes.imATeapot
  ])('Should render the %s page without logging the stack', (status) => {
    mockErrorLogger.mockClear()

    catchAll(mockRequest(status), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalled()
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      statusCode: status,
      ...errorPageFor(status)
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(status)
  })

  test('Should log the stack for a server error', () => {
    catchAll(mockRequest(statusCodes.internalServerError), mockToolkit)

    expect(mockErrorLogger).toHaveBeenCalledWith(mockStack)
    expect(mockToolkitCode).toHaveBeenCalledWith(
      statusCodes.internalServerError
    )
  })

  test('Should never pass the upstream error message to the page', () => {
    catchAll(mockRequest(statusCodes.forbidden), mockToolkit)

    expect(JSON.stringify(mockToolkitView.mock.lastCall)).not.toContain(
      'An upstream failure'
    )
  })

  describe('API routes', () => {
    const mockResponse = vi.fn()
    const jsonToolkit = {
      view: vi.fn().mockReturnThis(),
      response: mockResponse.mockReturnThis(),
      code: vi.fn().mockReturnThis()
    }

    test('Should return the Boom JSON payload rather than the HTML page', () => {
      const request = mockRequest(statusCodes.badGateway, '/api/payloads')

      catchAll(request, jsonToolkit)

      expect(jsonToolkit.view).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith({
        statusCode: statusCodes.badGateway,
        error: 'Error',
        message: 'An upstream failure'
      })
      expect(jsonToolkit.code).toHaveBeenCalledWith(statusCodes.badGateway)
    })

    test('Should still render the HTML page for a non-API path', () => {
      catchAll(mockRequest(statusCodes.notFound, '/apiary'), mockToolkit)

      expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
        statusCode: statusCodes.notFound,
        ...errorPageFor(statusCodes.notFound)
      })
    })
  })
})
