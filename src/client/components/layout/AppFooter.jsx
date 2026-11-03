import { isPlainClick } from '../govuk/utils.js'
import { METRICS_DOC } from '../views/scope.jsx'

const OGL =
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'

const PAGES = [
  { id: 'accessibility', label: 'Accessibility statement' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'cookies', label: 'Cookies' }
]

/** Defra footer (https://digital.defra.gov.uk/design/branding); no Crown copyright off GOV.UK. */
export function AppFooter({ onNavigate }) {
  return (
    <footer className="defra-footer">
      <div className="govuk-width-container">
        <div className="defra-footer__meta">
          <div className="defra-footer__meta-item">
            <h2 className="govuk-visually-hidden">Support links</h2>
            <ul className="defra-footer__inline-list">
              <li className="defra-footer__inline-list-item">
                <a className="defra-footer__link" href={METRICS_DOC}>
                  Metric definitions
                </a>
              </li>
              {PAGES.map((page) => (
                <li key={page.id} className="defra-footer__inline-list-item">
                  <a
                    className="defra-footer__link"
                    href={`#/${page.id}`}
                    onClick={(event) => {
                      if (!onNavigate || !isPlainClick(event)) return
                      event.preventDefault()
                      onNavigate(page.id)
                    }}
                  >
                    {page.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="defra-footer__meta-item">
            <span className="defra-footer__licence-description">
              Maintained by the MMO Catch Recording team at Defra.
            </span>
          </div>
          <div className="defra-footer__meta-item">
            <span className="defra-footer__licence-description">
              All content is available under the{' '}
              <a className="defra-footer__link" href={OGL} rel="license">
                Open Government Licence v3.0
              </a>
              , except where otherwise stated
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
