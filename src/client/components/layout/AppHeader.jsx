// Served from Vite's public dir; the official asset from the Defra digital service manual.
const DEFRA_LOGO = '/public/images/defra-logo.svg'

const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')

function SignedInUser({ user }) {
  return (
    <>
      <span className="app-avatar" aria-hidden="true">
        {initialsOf(user.name)}
      </span>
      <span className="govuk-visually-hidden">Signed in as {user.name}</span>
      <a className="govuk-link app-header__signout" href="/logout">
        Sign out
      </a>
    </>
  )
}

/**
 * Defra header (https://digital.defra.gov.uk/design/branding): the service is
 * not on GOV.UK, so no GOV.UK header or crown. The logo is decorative; the
 * service name is the home link.
 */
export function AppHeader({
  serviceName,
  homeHref = '#/overview',
  projectSwitcher,
  user,
  children
}) {
  return (
    <header>
      <div className="defra-header">
        <div className="govuk-width-container defra-header__inner">
          <img
            src={DEFRA_LOGO}
            alt=""
            role="presentation"
            className="defra-header__logo"
          />
          <a href={homeHref} className="defra-header__service-name">
            <span className="govuk-visually-hidden">
              Department for Environment, Food and Rural Affairs:
            </span>{' '}
            {serviceName}
          </a>
          {(projectSwitcher || user) && (
            <div className="defra-header__tools">
              {projectSwitcher}
              {user && <SignedInUser user={user} />}
            </div>
          )}
        </div>
      </div>
      {children}
    </header>
  )
}
