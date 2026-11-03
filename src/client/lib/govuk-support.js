/**
 * Adds the classes GOV.UK Frontend's template sets with an inline script. Called
 * from the bundle instead, so the CSP can keep `script-src 'self'`.
 */
export function markGovukFrontendSupported(body) {
  body.classList.add('js-enabled')

  if ('noModule' in HTMLScriptElement.prototype) {
    body.classList.add('govuk-frontend-supported')
  }
}
