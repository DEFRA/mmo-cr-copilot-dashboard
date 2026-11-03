import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { Button } from './Button.jsx'

describe('#Button', () => {
  test('Should render a button that does not submit by default', () => {
    render(<Button>Save changes</Button>)

    const button = screen.getByRole('button', { name: 'Save changes' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('govuk-button')
  })

  test.each(['secondary', 'warning', 'inverse'])(
    'Should apply the %s variant',
    (variant) => {
      render(<Button variant={variant}>Go</Button>)

      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(
        `govuk-button--${variant}`
      )
    }
  )

  test('Should mark a disabled button for assistive technology', () => {
    render(<Button disabled>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  test('Should report clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Apply</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  describe('With an href', () => {
    test('Should render a link with the button role', () => {
      render(<Button href="#/settings">Settings</Button>)

      const link = screen.getByRole('button', { name: 'Settings' })
      expect(link.tagName).toBe('A')
      expect(link).toHaveAttribute('href', '#/settings')
      expect(link).toHaveAttribute('draggable', 'false')
    })

    test('Should activate on Space and forward other keys', async () => {
      const onClick = vi.fn((event) => event.preventDefault())
      const onKeyDown = vi.fn()
      render(
        <Button href="#/settings" onClick={onClick} onKeyDown={onKeyDown}>
          Settings
        </Button>
      )

      screen.getByRole('button', { name: 'Settings' }).focus()
      await userEvent.keyboard('a')
      expect(onClick).not.toHaveBeenCalled()

      await userEvent.keyboard(' ')
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onKeyDown).toHaveBeenCalledTimes(2)
    })
  })

  test('Should have no axe violations', async () => {
    const { container } = render(<Button>Save</Button>)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
