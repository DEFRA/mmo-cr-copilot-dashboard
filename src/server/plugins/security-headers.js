/**
 * Response headers Hapi's built-in `routes.security` and the CSP plugin do not
 * cover.
 *
 * `Referrer-Policy` stops dashboard URLs — which carry repository names and PR
 * numbers — leaking to third parties. `Permissions-Policy` denies browser
 * features the dashboard never uses, so an XSS cannot reach them.
 */
const SECURITY_HEADERS = {
  'referrer-policy': 'no-referrer',
  'permissions-policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin'
}

export const securityHeaders = {
  plugin: {
    name: 'security-headers',
    register(server) {
      server.ext('onPreResponse', (request, h) => {
        const { response } = request
        const headers = response.isBoom
          ? response.output.headers
          : response.headers

        if (headers) {
          Object.assign(headers, SECURITY_HEADERS)
        }

        return h.continue
      })
    }
  }
}
