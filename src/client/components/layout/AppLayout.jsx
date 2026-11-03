import { AppFooter } from './AppFooter.jsx'
import { AppHeader } from './AppHeader.jsx'

/**
 * Page shell: header (with navigation) → main (hero, then the view)
 * → footer. The hero sits in main so the skip link lands on the h1.
 */
export function AppLayout({
  serviceName,
  projectSwitcher,
  user,
  navigation,
  hero,
  children,
  onNavigate
}) {
  return (
    <>
      <AppHeader
        serviceName={serviceName}
        projectSwitcher={projectSwitcher}
        user={user}
      >
        {navigation}
      </AppHeader>
      <main id="main-content" tabIndex={-1} className="app-main">
        {hero}
        <div className="govuk-width-container">
          <div className="govuk-main-wrapper app-main__body">{children}</div>
        </div>
      </main>
      <AppFooter onNavigate={onNavigate} />
    </>
  )
}
