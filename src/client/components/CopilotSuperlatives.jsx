import { KpiCard, PanelState } from './dashboard'
import { formatCredits } from './views/scope.jsx'

const metric = (item) => item.value ?? item.metric

// Four visually distinct families, so no two cards match however the grid wraps.
const DEFINITIONS = {
  'biggest-spender': {
    label: 'Biggest Spender',
    family: 'output',
    icon: 'box',
    badge: 'Most AI credits',
    value: (item) => item.model,
    sub: (item) => `${metric(item)}% of all recorded AI credits`
  },
  'best-value': {
    label: 'Best Value',
    family: 'adoption',
    icon: 'gauge',
    badge: 'Fewest credits per call',
    value: (item) => item.model,
    sub: (item) =>
      `${formatCredits(metric(item))} AI credits per request on average`
  },
  'night-owl': {
    label: 'Night Owl Model',
    family: 'speed',
    icon: 'clock',
    badge: 'Out of hours',
    value: (item) => item.model,
    sub: (item) => `${metric(item)}% of its requests in commits made 7pm to 7am`
  },
  'prompt-polyglot': {
    label: 'Prompt Polyglot',
    family: 'risk',
    icon: 'grid',
    badge: 'Model variety',
    value: (item) => `${metric(item)}`,
    unit: 'models',
    sub: (item) =>
      `${item.multiModelPrShare ?? item.extra ?? 0}% of pull requests with usage used 2 or more models`
  }
}

export function CopilotSuperlatives({ superlatives = [], headingLevel = 4 }) {
  if (superlatives.length === 0) {
    return (
      <PanelState
        state="empty"
        icon="target"
        emptyTag="Not enough usage yet"
        emptyMessage="Superlatives appear once at least two pull requests carry usage for a model."
      />
    )
  }

  return (
    <div className="app-kpi-grid app-kpi-grid--3">
      {superlatives.map((item) => {
        const definition = DEFINITIONS[item.id]
        if (!definition) return null
        return (
          <KpiCard
            key={item.id}
            family={definition.family}
            showFamily={false}
            compact
            headingLevel={headingLevel}
            label={definition.label}
            icon={definition.icon}
            badge={definition.badge}
            value={definition.value(item)}
            unit={definition.unit}
            sub={definition.sub(item)}
          />
        )
      })}
    </div>
  )
}
