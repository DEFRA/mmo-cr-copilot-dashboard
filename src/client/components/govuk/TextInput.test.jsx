import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { TextInput } from './TextInput.jsx'

describe('#TextInput', () => {
  test('Should label the input and default to a text type', () => {
    render(<TextInput label="Project name" />)

    const input = screen.getByLabelText('Project name')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveClass('govuk-input')
    expect(input).toHaveAttribute('name', input.id)
  })

  test('Should apply the name, width, label size and type', () => {
    render(
      <TextInput
        id="slug"
        name="projectSlug"
        label="Slug"
        labelSize="s"
        width="10"
        type="search"
      />
    )

    const input = screen.getByLabelText('Slug')
    expect(input).toHaveAttribute('id', 'slug')
    expect(input).toHaveAttribute('name', 'projectSlug')
    expect(input).toHaveAttribute('type', 'search')
    expect(input).toHaveClass('govuk-input--width-10')
    expect(screen.getByText('Slug')).toHaveClass('govuk-label--s')
  })

  test('Should describe the input with its hint and error', () => {
    render(
      <TextInput
        id="slug"
        label="Slug"
        hint="Like CRAR"
        errorMessage="Enter a slug"
      />
    )

    const input = screen.getByLabelText('Slug')
    expect(input).toHaveAccessibleDescription('Like CRAR Error: Enter a slug')
    expect(input).toHaveClass('govuk-input--error')
    expect(input.closest('.govuk-form-group')).toHaveClass(
      'govuk-form-group--error'
    )
  })

  test('Should have no description without a hint or error', () => {
    render(<TextInput label="Slug" />)

    expect(screen.getByLabelText('Slug')).not.toHaveAttribute(
      'aria-describedby'
    )
  })

  test('Should pass value, handlers and the ref to the input', async () => {
    const onChange = vi.fn()
    const ref = createRef()
    render(
      <TextInput
        ref={ref}
        label="Slug"
        spellCheck={false}
        autoComplete="off"
        onChange={onChange}
      />
    )

    await userEvent.type(screen.getByLabelText('Slug'), 'ab')

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(ref.current).toBe(screen.getByLabelText('Slug'))
    expect(ref.current).toHaveAttribute('autocomplete', 'off')
  })

  test('Should have no axe violations', async () => {
    const { container } = render(
      <TextInput label="Slug" hint="Like CRAR" errorMessage="Enter a slug" />
    )

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
