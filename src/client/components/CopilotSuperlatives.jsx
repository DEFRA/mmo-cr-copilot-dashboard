import { KpiCard, PanelState } from './dashboard'

const metric = (item) => item.value ?? item.metric

// Six visually distinct families (Assist and Quality share a teal), so no two cards match however the grid wraps.
const DEFINITIONS = {
  'token-heavyweight': {
    label: 'Token Heavyweight',
    family: 'output',
    icon: 'box',
    badge: 'Most tokens',
    value: (item) => item.model,
    sub: (item) => `${metric(item)}% of all tokens`
  },
  'cache-champion': {
    label: 'Cache Champion',
    family: 'quality',
    icon: 'layers',
    badge: 'Best cache reuse',
    value: (item) => item.model,
    sub: (item) => `${metric(item)}% of input tokens served from cache`
  },
  'token-economiser': {
    label: 'Token Economiser',
    family: 'adoption',
    icon: 'gauge',
    badge: 'Fewest tokens per call',
    value: (item) => item.model,
    sub: (item) =>
      `${metric(item).toLocaleString('en-GB')} tokens per request on average`
  },
  'deep-thinker': {
    label: 'Deep Thinker',
    family: 'leverage',
    icon: 'radar',
    badge: 'Most reasoning',
    value: (item) => item.model,
    sub: (item) => `${metric(item)}% of output tokens spent reasoning`
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
