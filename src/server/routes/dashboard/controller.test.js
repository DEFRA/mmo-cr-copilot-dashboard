import { load } from 'cheerio'

import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

describe('#dashboard route', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  const render = async () => {
    const response = await server.inject({ method: 'GET', url: '/' })
    return { response, $: load(response.result) }
  }

  test('Should render the shell the React app mounts into', async () => {
    const { response, $ } = await render()

    expect(response.statusCode).toBe(statusCodes.ok)
    expect($('#root')).toHaveLength(1)
  })

  test('Should pass runtime configuration as data attributes', async () => {
    const { $ } = await render()

    expect($('#root').attr('data-poll-interval-ms')).toBe('15000')
    expect($('#root').attr('data-service-name')).toBe(
      'mmo-cr-copilot-dashboard'
    )
  })

  test('Should not use an inline script, so the CSP can forbid them', async () => {
    const { $ } = await render()

    const inlineScripts = $('script')
      .toArray()
      .filter((element) => !$(element).attr('src'))

    expect(inlineScripts).toHaveLength(0)
  })

  test('Should load the application entry as a module', async () => {
    const { $ } = await render()

    const sources = $('script[type="module"]')
      .toArray()
      .map((element) => $(element).attr('src'))

    expect(sources).toContain('/public/src/client/main.jsx')
  })

  test('Should title the page for the service', async () => {
    const { $ } = await render()

    expect($('title').text()).toBe(
      'Copilot analytics | mmo-cr-copilot-dashboard'
    )
  })

  test('Should explain the dependency on JavaScript', async () => {
    const { $ } = await render()

    expect($('noscript').text()).toContain('needs JavaScript')
  })

  test('Should send a content security policy that forbids inline script', async () => {
    const { response } = await render()
    const csp = response.headers['content-security-policy']

    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).toContain("object-src 'none'")
  })

  test('Should render the error page for an unknown path', async () => {
    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: '/not-a-page'
    })

    expect(statusCode).toBe(statusCodes.notFound)
    expect(result).toContain('Page not found')
  })
})
