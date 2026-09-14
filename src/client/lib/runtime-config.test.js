import { readRuntimeConfig } from './runtime-config.js'

const element = (dataset) => ({ dataset })

describe('#readRuntimeConfig', () => {
  test('Should read the poll interval from the root element', () => {
    expect(
      readRuntimeConfig(element({ pollIntervalMs: '30000' }))
    ).toMatchObject({ pollIntervalMs: 30000 })
  })

  test('Should read the service name from the root element', () => {
    expect(
      readRuntimeConfig(element({ serviceName: 'Copilot analytics' }))
        .serviceName
    ).toBe('Copilot analytics')
  })

  test.each([
    ['a missing attribute', {}],
    ['a non-numeric value', { pollIntervalMs: 'soon' }],
    ['zero', { pollIntervalMs: '0' }],
    ['a negative value', { pollIntervalMs: '-1' }]
  ])('Should fall back to the default interval for %s', (_label, dataset) => {
    expect(readRuntimeConfig(element(dataset)).pollIntervalMs).toBe(15000)
  })

  test('Should fall back to a default service name', () => {
    expect(readRuntimeConfig(element({})).serviceName).toBe(
      'Copilot Analytics Dashboard'
    )
  })

  test('Should read from the document root element by default', () => {
    document.body.innerHTML =
      '<div id="root" data-poll-interval-ms="5000"></div>'

    expect(readRuntimeConfig().pollIntervalMs).toBe(5000)
  })

  test('Should use defaults when there is no root element', () => {
    document.body.innerHTML = ''

    expect(readRuntimeConfig()).toEqual({
      pollIntervalMs: 15000,
      serviceName: 'Copilot Analytics Dashboard'
    })
  })
})
