import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { DateInput } from './DateInput.jsx'

describe('#DateInput', () => {
  test('Should group labelled day, month and year inputs', () => {
    render(<DateInput id="start" namePrefix="start" legend="Sprint start" />)

    expect(
      screen.getByRole('group', { name: 'Sprint start' })
    ).toBeInTheDocument()
    const day = screen.getByRole('textbox', { name: 'Day' })
    expect(day).toHaveAttribute('id', 'start-day')
    expect(day).toHaveAttribute('name', 'start-day')
    expect(day).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByRole('textbox', { name: 'Year' })).toHaveClass(
      'govuk-input--width-4'
    )
  })

  test('Should keep its own value and report each change', async () => {
    const onChange = vi.fn()
    render(
      <DateInput
        legend="Sprint start"
        defaultValue={{ month: '10' }}
        onChange={onChange}
      />
    )

    await userEvent.type(screen.getByRole('textbox', { name: 'Day' }), '1')

    expect(screen.getByRole('textbox', { name: 'Day' })).toHaveValue('1')
    expect(onChange).toHaveBeenLastCalledWith({ day: '1', month: '10' })
  })

  test('Should follow a controlled value', async () => {
    const onChange = vi.fn()
    render(
      <DateInput
        legend="Sprint start"
        value={{ day: '14', month: '10', year: '2026' }}
        onChange={onChange}
      />
    )

    await userEvent.type(screen.getByRole('textbox', { name: 'Year' }), '7')

    expect(onChange).toHaveBeenLastCalledWith({
      day: '14',
      month: '10',
      year: '20267'
    })
    expect(screen.getByRole('textbox', { name: 'Year' })).toHaveValue('2026')
  })

  test('Should describe the group and mark every field in error', () => {
    render(
      <DateInput
        id="start"
        legend="Sprint start"
        hint="For example, 27 3 2026"
        errorMessage="Enter a real date"
      />
    )

    const group = screen.getByRole('group', { name: 'Sprint start' })
    expect(group).toHaveAccessibleDescription(
      'For example, 27 3 2026 Error: Enter a real date'
    )
    for (const name of ['Day', 'Month', 'Year']) {
      expect(screen.getByRole('textbox', { name })).toHaveClass(
        'govuk-input--error'
      )
    }
  })

  test('Should mark only the named fields in error', () => {
    render(
      <DateInput
        legend="Sprint start"
        errorMessage="Date must include a year"
        errorFields={['year']}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Year' })).toHaveClass(
      'govuk-input--error'
    )
    expect(screen.getByRole('textbox', { name: 'Day' })).not.toHaveClass(
      'govuk-input--error'
    )
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <DateInput legend="Sprint start" hint="For example, 27 3 2026" />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
