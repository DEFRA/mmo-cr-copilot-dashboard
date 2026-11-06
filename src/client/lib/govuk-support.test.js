import { markGovukFrontendSupported } from './govuk-support.js'

// jsdom does not implement noModule, so each test sets it explicitly.
describe('#markGovukFrontendSupported', () => {
  const proto = HTMLScriptElement.prototype

  afterEach(() => {
    delete proto.noModule
  })

  test('Should mark the body as JavaScript enabled and supported', () => {
    const body = document.createElement('body')
    Object.defineProperty(proto, 'noModule', {
      value: false,
      configurable: true
    })

    markGovukFrontendSupported(body)

    expect(body).toHaveClass('js-enabled', 'govuk-frontend-supported')
  })

  test('Should not claim support in a browser without module scripts', () => {
    const body = document.createElement('body')

    markGovukFrontendSupported(body)

    expect(body).toHaveClass('js-enabled')
    expect(body).not.toHaveClass('govuk-frontend-supported')
  })
})
