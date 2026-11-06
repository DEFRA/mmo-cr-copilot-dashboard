import { useMemo } from 'react'

import { PanelState } from '../dashboard'
import { selectDoneTickets, selectTicketRows } from '../../lib/selectors'
import { KpiDrillGrid, Subsection } from './scope.jsx'
import { buildDeliveryKpis } from './delivery-kpis.js'

const SNAPSHOT_KPIS = ['changeLead', 'frequency', 'changeFail', 'unlinked']

/** Four headline Jira delivery cards for the overview, linking to the full page. */
export function DeliverySnapshot({
  delivery,
  payloads,
  window,
  deliveryHref,
  onOpenTicket,
  onOpenPR
}) {
  const { metrics, issues, status } = delivery
  const done = useMemo(
    () =>
      selectDoneTickets(
        selectTicketRows(issues, payloads),
        window?.start,
        window?.end
      ),
    [issues, payloads, window?.start, window?.end]
  )
  const unlinked = useMemo(
    () =>
      payloads.filter(
        (p) => !Array.isArray(p.jiraKeys) || p.jiraKeys.length === 0
      ),
    [payloads]
  )
  const kpis = useMemo(() => {
    if (!metrics) return []
    const all = buildDeliveryKpis({
      metrics,
      done,
      unlinked,
      onOpenTicket,
      onOpenPR
    })
    return SNAPSHOT_KPIS.map((id) => all[id])
  }, [metrics, done, unlinked, onOpenTicket, onOpenPR])

  return (
    <Subsection
      title="Delivery"
      family="speed"
      icon="ticket"
      meta="Measured to Jira Done"
    >
      {status === 'error' && (
        <PanelState
          state="error"
          icon="ticket"
          errorMessage="We could not load delivery metrics. Try again later."
        />
      )}
      {status !== 'error' && kpis.length === 0 && (
        <PanelState state="loading" icon="ticket" />
      )}
      {kpis.length > 0 && (
        <KpiDrillGrid
          kpis={kpis}
          drillId="overview-delivery-drill"
          actionText="tickets"
        />
      )}
      <p className="govuk-body">
        <a className="govuk-link" href={deliveryHref}>
          View all delivery metrics
        </a>
      </p>
    </Subsection>
  )
}
