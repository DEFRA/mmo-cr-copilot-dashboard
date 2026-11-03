import { useEffect } from 'react'

import { PhaseBanner } from './PhaseBanner.jsx'

/**
 * Hero strip: phase banner, breadcrumbs, caption, the page's only `<h1>` and
 * controls. Keeps `document.title` in step with the heading.
 */
export function Hero({
  serviceName,
  caption,
  heading,
  breadcrumbs,
  controls,
  notices
}) {
  useEffect(() => {
    document.title = `${heading} – ${serviceName}`
  }, [heading, serviceName])

  return (
    <div className="app-hero">
      <div className="govuk-width-container">
        <PhaseBanner>This is a new service.</PhaseBanner>
        {breadcrumbs}
        <div className="app-hero__row">
          <div>
            {caption && <p className="app-hero__caption">{caption}</p>}
            <h1 className="govuk-heading-xl app-hero__title">{heading}</h1>
          </div>
          {controls && <div className="app-hero__controls">{controls}</div>}
        </div>
        <div className="app-hero__notices" aria-live="polite">
          {notices}
        </div>
      </div>
    </div>
  )
}
