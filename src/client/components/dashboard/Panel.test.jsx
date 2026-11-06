import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Panel } from './Panel.jsx'
import { PanelState } from './PanelState.jsx'

describe('#Panel', () => {
  test('Should be a region named by its heading with a family band', () => {
    render(
      <Panel
        title="Quality gate"
        family="quality"
        icon="shield"
        aside={<span>Passed</span>}
        actions={<button type="button">Refresh</button>}
      >
        <p>Body</p>
      </Panel>
    )

    const panel = screen.getByRole('region', { name: 'Quality Gate' })
    expect(panel).toHaveClass('app-panel', 'app-family--quality')
    expect(panel).not.toHaveAttribute('aria-busy')
    expect(
      screen.getByRole('heading', { level: 3, name: 'Quality Gate' })
    ).toBeInTheDocument()
    expect(panel.querySelector('.app-panel__aside')).toHaveTextContent(
      'PassedRefresh'
    )
    expect(panel.querySelector('.app-panel__icon svg')).toBeInTheDocument()
  })

  test('Should render as another element, heading level and busy state', () => {
    render(
      <Panel title="Figure" as="figure" headingLevel={4} busy>
        x
      </Panel>
    )

    expect(screen.getByRole('figure', { name: 'Figure' })).toHaveAttribute(
      'aria-busy',
      'true'
    )
    expect(screen.getByRole('heading', { level: 4 })).toBeInTheDocument()
  })

  test('Should omit the icon and aside when not given', () => {
    const { container } = render(<Panel title="Plain">x</Panel>)

    expect(container.querySelector('.app-panel__icon')).toBeNull()
    expect(container.querySelector('.app-panel__aside')).toBeNull()
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<Panel title="Panel">Body</Panel>)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#PanelState', () => {
  test('Should announce loading and hide the skeleton', () => {
    const { container } = render(<PanelState state="loading" title="Trend" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading Trend')
    expect(container.querySelector('.app-skeleton')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  test('Should explain an empty state with a grey tag and message', () => {
    render(
      <PanelState
        state="empty"
        emptyTag="Not available yet"
        emptyMessage="SonarCloud is not configured."
      />
    )

    expect(screen.getByText('Not available yet')).toHaveClass(
      'govuk-tag',
      'govuk-tag--grey'
    )
    expect(
      screen.getByText('SonarCloud is not configured.')
    ).toBeInTheDocument()
  })

  test('Should use the default empty wording', () => {
    render(<PanelState state="empty" />)

    expect(screen.getByText('No data for this period')).toBeInTheDocument()
  })

  test('Should show a generic error with a keyboard-operable retry', async () => {
    const onRetry = vi.fn()
    render(<PanelState state="error" title="Trend" onRetry={onRetry} />)

    expect(
      screen.getByText('Sorry, there is a problem with this data')
    ).toBeInTheDocument()
    expect(
      screen.getByText('We could not load this data. Try again later.')
    ).toBeInTheDocument()

    screen.getByRole('button', { name: 'Try again: Trend' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onRetry).toHaveBeenCalledOnce()
  })

  test('Should show no retry when none is offered', () => {
    render(<PanelState state="error" errorMessage="Backend unavailable." />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Backend unavailable.')).toBeInTheDocument()
  })

  test('Should render its children when populated', () => {
    render(<PanelState>Chart</PanelState>)

    expect(screen.getByText('Chart')).toBeInTheDocument()
  })

  test.each(['loading', 'empty', 'error'])(
    'Should have no axe violations when %s',
    async (state) => {
      const { container } = render(
        <PanelState state={state} title="T" onRetry={() => {}} />
      )

      expect(await axeViolations(container)).toStrictEqual([])
    }
  )
})
