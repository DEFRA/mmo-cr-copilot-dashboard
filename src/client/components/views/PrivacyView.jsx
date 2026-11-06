import { useEffect } from 'react'

import { BackLink, InsetText } from '../govuk'

/**
 * Privacy notice. The lawful basis, retention and contact sections wait on the
 * Defra DPIA, so they are deliberately left as a placeholder (backlog D14).
 */
export function PrivacyView({ onBack }) {
  useEffect(() => {
    document.title = 'Privacy – Copilot Delivery Insights'
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
        <h1 className="govuk-heading-xl">Privacy</h1>

        <h2 className="govuk-heading-l">Who we are</h2>
        <p className="govuk-body">
          The Department for Environment, Food and Rural Affairs (Defra) is the
          data controller for this service.
        </p>

        <h2 className="govuk-heading-l">What we collect</h2>
        <ul className="govuk-list govuk-list--bullet">
          <li>
            GitHub usernames and commit metadata (commit IDs, line counts,
            timestamps and classification) from the repositories each project
            includes
          </li>
          <li>
            your Microsoft Entra ID object identifier and display name when you
            sign in
          </li>
          <li>Jira ticket keys and statuses, but not ticket descriptions</li>
        </ul>

        <h2 className="govuk-heading-l">Why we use it</h2>
        <p className="govuk-body">
          To show teams how their delivery has changed. It is not used to rank
          or assess individuals.
        </p>

        <h2 className="govuk-heading-l">
          Lawful basis, how long we keep it and your rights
        </h2>
        <InsetText>
          This section will be confirmed by the Defra data protection team
          before the service goes live.
        </InsetText>

        <h2 className="govuk-heading-l">Contact</h2>
        <p className="govuk-body">
          Contact the MMO Catch Recording team at Defra.
        </p>
      </div>
    </div>
  )
}
