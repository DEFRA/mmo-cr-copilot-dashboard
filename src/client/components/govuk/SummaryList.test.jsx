import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { SummaryCard, SummaryList } from './SummaryList.jsx'

const ROWS = [
  {
    key: 'Repository',
    value: 'mmo-cr-api',
    actions: [
      { href: '#/repo', text: 'Change', visuallyHiddenText: 'repository' }
    ]
  },
  { key: 'Sprint', value: 'Sprint 8' }
]

describe('#SummaryList', () => {
  test('Should pair each key with its value', () => {
    render(<SummaryList rows={ROWS} />)

    expect(screen.getByText('Repository').tagName).toBe('DT')
    expect(screen.getByText('mmo-cr-api').tagName).toBe('DD')
  })

  test('Should name actions with visually hidden text', () => {
    render(<SummaryList rows={ROWS} />)

    expect(
      screen.getByRole('link', { name: /^Change\s?repository$/ })
    ).toHaveAttribute('href', '#/repo')
  })

  test('Should mark rows without actions when others have them', () => {
    render(<SummaryList rows={ROWS} noBorder />)

    expect(screen.getByText('Sprint').parentElement).toHaveClass(
      'govuk-summary-list__row--no-actions'
    )
    expect(screen.getByText('Repository').closest('dl')).toHaveClass(
      'govuk-summary-list--no-border'
    )
  })

  test('Should list several actions', () => {
    render(
      <SummaryList
        rows={[
          {
            id: 'repo',
            key: 'Repository',
            value: 'api',
            actions: [
              { href: '#/a', text: 'Change' },
              { href: '#/b', text: 'Remove' }
            ]
          }
        ]}
      />
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Remove' })).toBeInTheDocument()
  })
})

describe('#SummaryCard', () => {
  test('Should title the card and qualify action names with it', () => {
    render(
      <SummaryCard
        title="Sprint 8"
        headingLevel={3}
        actions={[{ href: '#/delete', text: 'Delete' }]}
        rows={ROWS}
      />
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'Sprint 8' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /^Delete\s?\(Sprint 8\)$/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /^Change\s?repository \(Sprint 8\)$/ })
    ).toBeInTheDocument()
  })

  test('Should list several card actions', () => {
    render(
      <SummaryCard
        title="Sprint 8"
        actions={[
          { href: '#/edit', text: 'Edit' },
          { href: '#/delete', text: 'Delete' }
        ]}
        rows={ROWS}
      />
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'Sprint 8' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /^Edit\s?\(Sprint 8\)$/ }).closest('li')
    ).toHaveClass('govuk-summary-card__action')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<SummaryCard title="Sprint 8" rows={ROWS} />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
