import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Radios } from './Radios.jsx'

const ITEMS = [
  { value: 'adopted', text: 'AI-adopted', hint: 'Copilot added later' },
  { value: 'native', text: 'AI-native' },
  { value: 'none', text: 'Not set', disabled: true }
]

describe('#Radios', () => {
  test('Should group the options under the legend', () => {
    render(<Radios name="type" legend="Project type" items={ITEMS} />)

    expect(
      screen.getByRole('group', { name: 'Project type' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Not set' })).toBeDisabled()
    expect(
      screen.getByRole('radio', { name: 'AI-adopted' })
    ).toHaveAccessibleDescription('Copilot added later')
  })

  test('Should be uncontrolled with a default and report the choice', async () => {
    const onChange = vi.fn()
    render(
      <Radios
        legend="Project type"
        items={ITEMS}
        defaultValue="native"
        onChange={onChange}
      />
    )

    expect(screen.getByRole('radio', { name: 'AI-native' })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: 'AI-adopted' }))

    expect(onChange).toHaveBeenCalledWith('adopted')
    expect(screen.getByRole('radio', { name: 'AI-adopted' })).toBeChecked()
  })

  test('Should follow a controlled value', () => {
    const { rerender } = render(
      <Radios legend="Type" items={ITEMS} value="adopted" onChange={vi.fn()} />
    )
    expect(screen.getByRole('radio', { name: 'AI-adopted' })).toBeChecked()

    rerender(
      <Radios legend="Type" items={ITEMS} value="native" onChange={vi.fn()} />
    )
    expect(screen.getByRole('radio', { name: 'AI-native' })).toBeChecked()
  })

  test('Should describe the group with its hint and error', () => {
    render(
      <Radios
        idPrefix="type"
        legend="Project type"
        legendSize="m"
        hint="Choose one"
        errorMessage="Select a project type"
        items={ITEMS}
        inline
        small
      />
    )

    const group = screen.getByRole('group', { name: 'Project type' })
    expect(group).toHaveAccessibleDescription(
      'Choose one Error: Select a project type'
    )
    expect(group.closest('.govuk-form-group')).toHaveClass(
      'govuk-form-group--error'
    )
    expect(screen.getByRole('radio', { name: 'AI-adopted' })).toHaveAttribute(
      'id',
      'type'
    )
    expect(screen.getByRole('radio', { name: 'AI-native' })).toHaveAttribute(
      'id',
      'type-2'
    )
    expect(
      screen.getByRole('radio', { name: 'AI-native' }).closest('.govuk-radios')
    ).toHaveClass('govuk-radios--inline', 'govuk-radios--small')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <Radios legend="Project type" hint="Choose one" items={ITEMS} />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
