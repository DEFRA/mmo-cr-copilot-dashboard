/** Phase banner. No feedback link until the service has a feedback URL. */
export function PhaseBanner({ tag = 'Beta', children }) {
  return (
    <div className="govuk-phase-banner">
      <p className="govuk-phase-banner__content">
        <strong className="govuk-tag govuk-phase-banner__content__tag">
          {tag}
        </strong>
        <span className="govuk-phase-banner__text">{children}</span>
      </p>
    </div>
  )
}
