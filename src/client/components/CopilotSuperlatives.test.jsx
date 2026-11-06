import { render, screen, within } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { reducedMotion } from '#/test-helpers/motion.js'
import { CopilotSuperlatives } from './CopilotSuperlatives.jsx'

const SUPERLATIVES = [
  { id: 'biggest-spender', model: 'gpt-5', value: 42.5 },
  { id: 'best-value', model: 'gpt-mini', value: 0.1234 },
  { id: 'night-owl', model: 'gemini', value: 9 },
  { id: 'prompt-polyglot', value: 4, multiModelPrShare: 35 }
]

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    reducedMotion(true).matchMedia
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('#CopilotSuperlatives', () => {
  test('Should render the empty state when there are no superlatives', () => {
    render(<CopilotSuperlatives />)

    expect(screen.getByText('Not enough usage yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Superlatives appear once at least two pull requests carry usage for a model.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  test('Should give every card a different colour', () => {
    render(<CopilotSuperlatives superlatives={SUPERLATIVES} />)

    const familyOf = (label) =>
      screen
        .getByRole('heading', { name: label })
        .closest('article')
        .className.match(/app-family--(\w+)/)[1]

    const families = [
      'Biggest Spender',
      'Best Value',
      'Night Owl Model',
      'Prompt Polyglot'
    ].map(familyOf)

    expect(families).toEqual(['output', 'adoption', 'speed', 'risk'])
    expect(new Set(families).size).toBe(families.length)
  })

  test('Should render a card for each superlative', () => {
    render(<CopilotSuperlatives superlatives={SUPERLATIVES} />)

    const cases = [
      [
        'Biggest Spender',
        'gpt-5',
        'Most AI credits',
        '42.5% of all recorded AI credits'
      ],
      [
        'Best Value',
        'gpt-mini',
        'Fewest credits per call',
        '0.12 AI credits per request on average'
      ],
      [
        'Night Owl Model',
        'gemini',
        'Out of hours',
        '9% of its requests in commits made 7pm to 7am'
      ],
      [
        'Prompt Polyglot',
        '4',
        'Model variety',
        '35% of pull requests with usage used 2 or more models'
      ]
    ]

    for (const [name, value, badge, sub] of cases) {
      const card = within(screen.getByRole('article', { name }))
      expect(
        screen.getByRole('heading', { level: 4, name })
      ).toBeInTheDocument()
      expect(card.getAllByText(value).length).toBeGreaterThan(0)
      expect(card.getByText(badge)).toBeInTheDocument()
      expect(card.getByText(sub)).toBeInTheDocument()
    }

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('Should use the requested heading level and fall back to the metric key', () => {
    render(
      <CopilotSuperlatives
        headingLevel={3}
        superlatives={[{ id: 'biggest-spender', model: 'gpt-5', metric: 50 }]}
      />
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'Biggest Spender' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('50% of all recorded AI credits')
    ).toBeInTheDocument()
  })

  test('Should show a tiny best-value rate as under 0.01 credits', () => {
    render(
      <CopilotSuperlatives
        superlatives={[{ id: 'best-value', model: 'gpt-mini', value: 0.004 }]}
      />
    )

    expect(
      screen.getByText('Under 0.01 AI credits per request on average')
    ).toBeInTheDocument()
  })

  test('Should skip unknown superlatives and default the multi-model share', () => {
    render(
      <CopilotSuperlatives
        superlatives={[
          { id: 'mystery', model: 'x', value: 1 },
          { id: 'prompt-polyglot', value: 2 }
        ]}
      />
    )

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(
      screen.getByText('0% of pull requests with usage used 2 or more models')
    ).toBeInTheDocument()
  })

  test('Should have no accessibility violations', async () => {
    const { container } = render(
      <CopilotSuperlatives superlatives={SUPERLATIVES} />
    )

    expect(await axeViolations(container)).toEqual([])
  })

  test('Should have no accessibility violations when empty', async () => {
    const { container } = render(<CopilotSuperlatives />)

    expect(await axeViolations(container)).toEqual([])
  })
})
