import { apiUrl } from './api.js'

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
