import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Checkboxes } from './Checkboxes.jsx'

const ITEMS = [
  { value: 'a', text: 'Alpha', hint: 'First one' },
  { value: 'b', text: 'Beta' },
  { value: 'c', text: 'Gamma', disabled: true }
]

function Controlled({ initial = ['a'], onChange = vi.fn() }) {
  const [value, setValue] = useState(initial)
  return (
    <Checkboxes
      legend="Pick"
      items={ITEMS}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('#Checkboxes', () => {
  test('Should group the options under the legend', () => {
    render(<Checkboxes name="pick" legend="Pick some" items={ITEMS} />)

    expect(screen.getByRole('group', { name: 'Pick some' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: 'Gamma' })).toBeDisabled()
    expect(
      screen.getByRole('checkbox', { name: 'Alpha' })
    ).toHaveAccessibleDescription('First one')
  })

  test('Should be uncontrolled with defaults', async () => {
    render(<Checkboxes legend="Pick" items={ITEMS} defaultValue={['b']} />)

    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).not.toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }))

    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked()
  })

  test('Should be uncontrolled and unchecked with no default', () => {
    render(<Checkboxes legend="Pick" items={ITEMS} />)

    expect(screen.getAllByRole('checkbox').some((box) => box.checked)).toBe(
      false
    )
  })

  test('Should report the next array when one is checked or unchecked', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Beta' }))
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b'])

    await userEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }))
    expect(onChange).toHaveBeenLastCalledWith(['b'])
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).not.toBeChecked()
  })

  test('Should treat a controlled value as the only truth', async () => {
    const onChange = vi.fn()
    render(
      <Checkboxes
        legend="Pick"
        items={ITEMS}
        value={['a']}
        onChange={onChange}
      />
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Beta' }))

    expect(onChange).toHaveBeenCalledWith(['a', 'b'])
    expect(screen.getByRole('checkbox', { name: 'Beta' })).not.toBeChecked()
  })

  test('Should not fail when there is no change handler', async () => {
    render(<Checkboxes legend="Pick" items={ITEMS} value={[]} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }))

    expect(screen.getByRole('checkbox', { name: 'Alpha' })).not.toBeChecked()
  })

  test('Should describe the group with its hint and error', () => {
    render(
      <Checkboxes
        idPrefix="pick"
        legend="Pick"
        legendSize="m"
        hint="Choose any"
        errorMessage="Select one"
        items={ITEMS}
        small
      />
    )

    const group = screen.getByRole('group', { name: 'Pick' })
    expect(group).toHaveAccessibleDescription('Choose any Error: Select one')
    expect(group.closest('.govuk-form-group')).toHaveClass(
      'govuk-form-group--error'
    )
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toHaveAttribute(
      'id',
      'pick'
    )
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toHaveAttribute(
      'id',
      'pick-2'
    )
    expect(
      screen
        .getByRole('checkbox', { name: 'Beta' })
        .closest('.govuk-checkboxes')
    ).toHaveClass('govuk-checkboxes--small')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <Checkboxes legend="Pick" hint="Choose any" items={ITEMS} />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })

  describe('conditional content', () => {
    const WITH_CONDITIONAL = [
      {
        value: 'a',
        text: 'Alpha',
        conditional: <p>Alpha details</p>
      },
      { value: 'b', text: 'Beta' }
    ]

    test('Should reveal the content only while the item is checked', async () => {
      function Reveal() {
        const [value, setValue] = useState([])
        return (
          <Checkboxes
            idPrefix="pick"
            legend="Pick"
            items={WITH_CONDITIONAL}
            value={value}
            onChange={setValue}
          />
        )
      }
      render(<Reveal />)

      expect(screen.queryByText('Alpha details')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }))

      expect(screen.getByText('Alpha details').parentElement).toHaveClass(
        'govuk-checkboxes__conditional'
      )
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).toHaveAttribute(
        'aria-controls',
        'pick-conditional'
      )

      await userEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }))

      expect(screen.queryByText('Alpha details')).not.toBeInTheDocument()
    })

    test('Should have no axe violations while revealed', async () => {
      const { container } = render(
        <Checkboxes
          legend="Pick"
          items={WITH_CONDITIONAL}
          value={['a']}
          onChange={vi.fn()}
        />
      )

      expect(await axeViolations(container)).toStrictEqual([])
    })
  })
})
