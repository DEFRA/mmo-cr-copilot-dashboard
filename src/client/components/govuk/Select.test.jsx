import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Select } from './Select.jsx'

const OPTIONS = [
  { value: 'copilot', text: 'Copilot-assisted' },
  { value: 'human', text: 'Human-authored' },
  { value: 'excluded', text: 'Excluded', disabled: true }
]

describe('#Select', () => {
  test('Should be labelled and report changes', async () => {
    const onChange = vi.fn()
    render(
      <Select
        label="Classification"
        options={OPTIONS}
        defaultValue="copilot"
        onChange={onChange}
      />
    )

    const select = screen.getByRole('combobox', { name: 'Classification' })
    expect(select).toHaveClass('govuk-select')
    expect(select).not.toHaveAttribute('aria-describedby')

    await userEvent.selectOptions(select, 'human')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(select).toHaveValue('human')
    expect(screen.getByRole('option', { name: 'Excluded' })).toBeDisabled()
  })

  test('Should describe itself with its hint and error', () => {
    render(
      <Select
        id="classification"
        name="class"
        label="Classification"
        hint="Choose how this commit is counted"
        errorMessage="Select a classification"
        options={OPTIONS}
        formGroupClassName="app-extra"
      />
    )

    const select = screen.getByRole('combobox', { name: 'Classification' })
    expect(select).toHaveAttribute('name', 'class')
    expect(select).toHaveAttribute(
      'aria-describedby',
      'classification-hint classification-error'
    )
    expect(select).toHaveAccessibleDescription(
      'Choose how this commit is counted Error: Select a classification'
    )
    expect(select).toHaveClass('govuk-select--error')
    expect(select.closest('.govuk-form-group')).toHaveClass(
      'govuk-form-group--error',
      'app-extra'
    )
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <Select label="Classification" hint="Pick one" options={OPTIONS} />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
