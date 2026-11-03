import { useId, useState } from 'react'

import { headingCase, Icon, KpiCard, PanelState } from '../dashboard'
import { familyClass } from '../dashboard/families.js'

// docs/metrics.md is not served by the app, so definitions link to the public repository.
export const METRICS_DOC =
  'https://github.com/DEFRA/mmo-cr-copilot-dashboard/blob/main/docs/metrics.md'
export { PERIOD_CHIP } from '../dashboard/PeriodChip.jsx'

export const lines = (n) => n.toLocaleString('en-GB')
export const plural = (n, one, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** Scope header shared by every cascade level (docs/design-system.md §8.4). */
export function ScopeHeader({ id, level, icon, title, meta }) {
  return (
    <div className="app-scope__head">
      <span className="app-scope__level">
        <Icon name={icon} size={16} />
        {level}
      </span>
      <h2 className="govuk-heading-l" id={id}>
        {headingCase(title)}
      </h2>
      {meta && <p className="app-scope__meta">{meta}</p>}
    </div>
  )
}

export function Subsection({ title, family, icon, meta, children }) {
  const headingId = useId()
  return (
    <section className="app-subsection" aria-labelledby={headingId}>
      <div className={`app-section__head ${familyClass(family)}`}>
        <span className="app-section__icon">
          <Icon name={icon} />
        </span>
        <h3 className="govuk-heading-m" id={headingId}>
          {headingCase(title)}
        </h3>
        {meta && <span className="app-muted">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

export function Meter({ value }) {
  return (
    <span className="app-meter" aria-hidden="true">
      <span
        className="app-meter__fill"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </span>
  )
}

export function OpenButton({ onClick, children, hint }) {
  return (
    <button type="button" className="app-link-button" onClick={onClick}>
      {children}
      {hint && <span className="govuk-visually-hidden">{hint}</span>}
    </button>
  )
}

/** The metric one scope down, opened from a KPI card (docs/design-system.md §8.5). */
function DrillPanel({ id, kpi }) {
  const headingId = useId()
  const handleMore = () => kpi.drill.more.onOpen()
  return (
    <section
      id={id}
      className={`app-drill ${familyClass(kpi.family)}`}
      aria-labelledby={headingId}
    >
      <div className="app-drill__head">
        <h3 className="govuk-heading-s govuk-!-margin-0" id={headingId}>
          {headingCase(kpi.drill.title)}
        </h3>
        <a
          className="govuk-link app-drill__def"
          href={`${METRICS_DOC}#${kpi.anchor}`}
        >
          Metric definition
          <span className="govuk-visually-hidden">: {kpi.label}</span>
        </a>
      </div>
      {kpi.drill.intro && <p className="govuk-body-s">{kpi.drill.intro}</p>}
      {kpi.drill.more && (
        <p className="govuk-body-s">
          <OpenButton onClick={handleMore}>{kpi.drill.more.text}</OpenButton>
        </p>
      )}
      {kpi.drill.items.length === 0 ? (
        <PanelState state="empty" title={kpi.drill.title} />
      ) : (
        <ul className="app-drill__list">
          {kpi.drill.items.map((item) => (
            <li key={item.key} className="app-drill__item">
              <span className="app-drill__name">
                {item.onOpen ? (
                  <OpenButton
                    onClick={() => item.onOpen()}
                    hint={kpi.drill.hint}
                  >
                    {item.name}
                  </OpenButton>
                ) : (
                  item.name
                )}
              </span>
              <span className="app-drill__value">{item.value}</span>
              {item.sub && <span className="app-drill__sub">{item.sub}</span>}
              {item.pct != null && <Meter value={item.pct} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** KPI cards with one drill panel open at a time beneath the grid. */
export function KpiDrillGrid({ kpis, drillId, actionText }) {
  const [openKpi, setOpenKpi] = useState(null)
  const openCard = kpis.find((k) => k.id === openKpi)

  return (
    <>
      <div className="app-kpi-grid">
        {kpis.map(({ id, drill, anchor, ...card }, index) => (
          <KpiCard
            key={id}
            {...card}
            index={index}
            actionText={actionText}
            onClick={() => setOpenKpi((v) => (v === id ? null : id))}
            expanded={openKpi === id}
            controls={drillId}
            dimmed={openKpi !== null && openKpi !== id}
          />
        ))}
      </div>
      {openCard && <DrillPanel id={drillId} kpi={openCard} />}
    </>
  )
}
