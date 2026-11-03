import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { ErrorSummary } from './ErrorSummary.jsx'

const ERRORS = [
  { href: '#period-start', text: 'Enter a valid start and end' },
  { text: 'Start must be before end' }
]

const renderWithField = (props = {}) =>
  render(
    <>
      <ErrorSummary errors={ERRORS} {...props} />
      <label htmlFor="period-start">From</label>
      <input id="period-start" />
    </>
  )

describe('#ErrorSummary', () => {
  test('Should announce the problem and take focus on mount', () => {
    renderWithField()

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('There is a problem')
    expect(alert.parentElement).toHaveFocus()
  })

  test('Should not take focus when auto focus is off', () => {
    renderWithField({ autoFocus: false })

    expect(screen.getByRole('alert').parentElement).not.toHaveFocus()
  })

  test('Should move focus to the field from its link', async () => {
    renderWithField()

    await userEvent.click(
      screen.getByRole('link', { name: 'Enter a valid start and end' })
    )

    expect(screen.getByRole('textbox', { name: 'From' })).toHaveFocus()
  })

  test('Should leave a link alone when its field is missing', async () => {
    render(
      <ErrorSummary errors={[{ href: '#missing', text: 'Check the date' }]} />
    )

    await userEvent.click(screen.getByRole('link', { name: 'Check the date' }))

    expect(window.location.hash).toBe('#missing')
  })

  test('Should show an error without a link and a description', () => {
    renderWithField({ description: 'Fix the period' })

    expect(screen.getByText('Fix the period')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Start must be before end' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Start must be before end')).toBeInTheDocument()
  })

  test('Should render without a list when there are no errors', () => {
    render(<ErrorSummary title="Check your answers" />)

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Check your answers'
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  test('Should have no axe violations', async () => {
    const { container } = renderWithField()

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
