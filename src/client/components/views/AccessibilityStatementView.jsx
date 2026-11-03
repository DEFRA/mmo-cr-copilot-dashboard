import { useEffect } from 'react'

import { BackLink } from '../govuk'

/** WCAG 2.2 AA accessibility statement for Copilot Delivery Insights. */
export function AccessibilityStatementView({ onBack }) {
  useEffect(() => {
    document.title = 'Accessibility statement – Copilot Delivery Insights'
  }, [])

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <BackLink
          href="#overview"
          onClick={onBack}
          className="govuk-!-margin-bottom-6"
        >
          Back
        </BackLink>
        <h1 className="govuk-heading-xl">
          Accessibility statement for Copilot Delivery Insights
        </h1>
        <p className="govuk-body">
          This accessibility statement applies to the Copilot Delivery Insights
          dashboard for the Marine Management Organisation (MMO) Catch Recording
          programme, part of the Department for Environment, Food and Rural
          Affairs (Defra).
        </p>

        <h2 className="govuk-heading-l">How accessible this service is</h2>
        <p className="govuk-body">
          This service is designed to be fully accessible and usable by as many
          people as possible. It is compliant with the Web Content Accessibility
          Guidelines version 2.2 AA standard. You should be able to:
        </p>
        <ul className="govuk-list govuk-list--bullet">
          <li>navigate all views and controls using just a keyboard</li>
          <li>navigate and use the service using a screen reader</li>
          <li>
            zoom in up to 400% without the text or charts breaking or spilling
            off the screen
          </li>
          <li>
            access alternative text descriptions and data table views for all
            charts and visualisations
          </li>
          <li>
            have animations automatically disabled when reduced motion is
            preferred
          </li>
        </ul>

        <h2 className="govuk-heading-l">Compliance status</h2>
        <p className="govuk-body">
          This service is fully compliant with the Web Content Accessibility
          Guidelines version 2.2 Level AA standard.
        </p>

        <h2 className="govuk-heading-l">Non-accessible content</h2>
        <p className="govuk-body">
          There is no known non-accessible content. All charts provide
          alternative text descriptions and data table views, ensuring visual
          metrics are accessible to screen readers and keyboard users.
        </p>

        <h2 className="govuk-heading-l">Feedback and contact information</h2>
        <p className="govuk-body">
          If you need information on this service in a different format, or if
          you find any accessibility problems not listed on this page, please
          contact:
        </p>
        <p className="govuk-body">
          Email:{' '}
          <a className="govuk-link" href="mailto:mmo-cr-devops@defra.gov.uk">
            mmo-cr-devops@defra.gov.uk
          </a>
        </p>
        <p className="govuk-body">
          We will review your request and get back to you within 5 working days.
        </p>

        <h2 className="govuk-heading-l">Enforcement procedure</h2>
        <p className="govuk-body">
          The Equality and Human Rights Commission (EHRC) is responsible for
          enforcing the Public Sector Bodies (Websites and Mobile Applications)
          (No. 2) Accessibility Regulations 2018 (the &apos;accessibility
          regulations&apos;). If you are not happy with how we respond to your
          complaint, contact the{' '}
          <a
            className="govuk-link"
            href="https://www.equalityadvisoryservice.com/"
            target="_blank"
            rel="noreferrer"
          >
            Equality Advisory and Support Service (EASS)
          </a>
          .
        </p>

        <h2 className="govuk-heading-l">
          Preparation of this accessibility statement
        </h2>
        <p className="govuk-body">
          This statement was prepared in October 2026. It was tested using
          automated accessibility testing (including axe-core and Vitest) and
          manual testing, covering keyboard navigation, screen reader checks,
          and colour contrast evaluations across both light and dark visual
          themes.
        </p>
      </div>
    </div>
  )
}
