import { useEffect } from 'react'

import { BackLink, Table } from '../govuk'
import { readRuntimeConfig } from '../../lib/runtime-config'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Cookies page: only the essential session cookie is set, so no consent banner is needed. */
export function CookiesView({ onBack }) {
  const { sessionCookieName, sessionCookieTtlHours } = readRuntimeConfig()

  useEffect(() => {
    document.title = 'Cookies – Copilot Delivery Insights'
  }, [])

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <BackLink
          href="#/overview"
          onClick={onBack}
          className="govuk-!-margin-bottom-6"
        >
          Back
        </BackLink>
        <h1 className="govuk-heading-xl">Cookies</h1>
        <p className="govuk-body">
          Cookies are small files saved on your device when you use a website.
        </p>
        <p className="govuk-body">
          This service uses one essential cookie to keep you signed in. We do
          not use analytics or marketing cookies, so we do not ask for your
          consent.
        </p>

        <h2 className="govuk-heading-l">Essential cookies</h2>
        <Table
          caption="Essential cookies used by this service"
          captionHidden
          head={[
            { id: 'name', label: 'Name' },
            { id: 'purpose', label: 'Purpose' },
            { id: 'expires', label: 'Expires' }
          ]}
          rows={[
            {
              id: 'session',
              cells: [
                sessionCookieName,
                'Keeps you signed in',
                plural(sessionCookieTtlHours, 'hour', 'hours')
              ]
            }
          ]}
        />
      </div>
    </div>
  )
}
