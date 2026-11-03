import { Tag } from '../govuk/Tag.jsx'
import { Icon } from './Icon.jsx'

const CLASSIFICATIONS = {
  copilot: { short: 'Copilot', long: 'Copilot-assisted', icon: 'sparkle' },
  human: { short: 'Human', long: 'Human-authored', icon: 'person' }
}

const toClassification = (value) =>
  /^human/i.test(String(value)) ? 'human' : 'copilot'

/** Copilot or Human; accepts `copilot`/`human` or the payload's `Copilot-assisted`/`Human-authored`. */
export function ClassificationBadge({ classification, long = false }) {
  const kind = toClassification(classification)
  const { short, long: full, icon } = CLASSIFICATIONS[kind]

  return (
    <span className={`app-badge app-badge--${kind}`}>
      <Icon name={icon} size={14} />
      {long ? full : short}
    </span>
  )
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL']

/** Complexity band XS–XL with an optional score, for example "M · 52". */
export function ComplexityChip({ band, score }) {
  const size = SIZES.includes(band) ? band : 'M'

  return (
    <span className={`app-size app-size--${size.toLowerCase()}`}>
      <span className="govuk-visually-hidden">Complexity </span>
      {size}
      {score !== undefined && score !== null && <span> · {score}</span>}
    </span>
  )
}

const RATINGS = ['A', 'B', 'C', 'D', 'E']

/** SonarCloud A–E rating square with its text label beneath. */
export function SonarRating({ rating, label }) {
  const known = RATINGS.includes(rating)

  return (
    <span className="app-ratings__item">
      <span
        className={`app-rating app-rating--${known ? rating.toLowerCase() : 'none'}`}
        aria-hidden="true"
      >
        {known ? rating : '–'}
      </span>
      <span className="app-rating__label" aria-hidden="true">
        {label}
      </span>
      <span className="govuk-visually-hidden">
        {label} rating {known ? rating : 'not available'}
      </span>
    </span>
  )
}

const JIRA_COLOURS = {
  done: 'green',
  'in review': undefined,
  'in progress': 'purple',
  'to do': 'grey'
}

/** Jira status as a GOV.UK tag: Done green, In review blue, In progress purple, To do grey. */
export function JiraStatusTag({ status }) {
  const key = String(status ?? '').toLowerCase()
  const colour = key in JIRA_COLOURS ? JIRA_COLOURS[key] : 'grey'

  return <Tag colour={colour}>{status || 'Unknown'}</Tag>
}

/** Marks a control that only admins see. Hiding is not security; the server enforces it. */
export function AdminOnlyTag() {
  return <Tag colour="grey">Admin only</Tag>
}
