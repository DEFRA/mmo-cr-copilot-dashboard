export function ErrorMessage({ id, children }) {
  return (
    <p id={id} className="govuk-error-message">
      <span className="govuk-visually-hidden">Error:</span> {children}
    </p>
  )
}
