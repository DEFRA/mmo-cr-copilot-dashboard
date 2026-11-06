import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { ANNOUNCE_DELAY_MS, Combobox } from './Combobox.jsx'

const OPTIONS = ['DEFRA/alpha', 'DEFRA/beta', 'DEFRA/gamma']

function Harness({ onSelect = () => {}, onSubmit, ...props }) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.()
      }}
    >
      <Combobox
        id="repo"
        label="Repository"
        itemName="repository"
        itemNamePlural="repositories"
        options={OPTIONS}
        value={value}
        onChange={setValue}
        onSelect={(text, meta) => {
          onSelect(text, meta)
          setValue('')
        }}
        {...props}
      />
    </form>
  )
}

const input = () => screen.getByRole('combobox', { name: 'Repository' })
const names = () => screen.queryAllByRole('option').map((o) => o.textContent)
const status = () => screen.getByRole('status')
const pause = (ms = ANNOUNCE_DELAY_MS) => act(() => vi.advanceTimersByTime(ms))
const setupFake = () => {
  vi.useFakeTimers()
  // Testing Library only advances fake timers it detects through a jest global.
  vi.stubGlobal('jest', { advanceTimersByTime: vi.advanceTimersByTime })
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

describe('#Combobox', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('Should label the input and start collapsed', () => {
    render(<Harness hint="As owner/name" />)

    expect(input()).toHaveAttribute('aria-autocomplete', 'list')
    expect(input()).toHaveAttribute('aria-expanded', 'false')
    expect(input()).not.toHaveAttribute('aria-controls')
    expect(input()).toHaveAccessibleDescription('As owner/name')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(status()).toBeEmptyDOMElement()
  })

  test('Should open on click and announce the count', async () => {
    const user = setupFake()
    render(<Harness />)

    await user.click(input())
    pause()

    expect(names()).toStrictEqual(OPTIONS)
    expect(input()).toHaveAttribute('aria-expanded', 'true')
    expect(input()).toHaveAttribute(
      'aria-controls',
      screen.getByRole('listbox').id
    )
    expect(status()).toHaveTextContent('3 repositories found')
  })

  test('Should announce only after the user pauses typing', async () => {
    const user = setupFake()
    render(<Harness />)

    await user.type(input(), 'de')
    pause(ANNOUNCE_DELAY_MS - 1)
    expect(status()).toBeEmptyDOMElement()

    await user.type(input(), 'fra/g')
    pause(ANNOUNCE_DELAY_MS - 1)
    expect(status()).toBeEmptyDOMElement()

    pause(1)
    expect(status()).toHaveTextContent('1 repository found')
  })

  test('Should clear the announcement at once and never announce after unmount', async () => {
    const user = setupFake()
    const { unmount } = render(<Harness />)
    await user.click(input())
    pause()
    expect(status()).toHaveTextContent('3 repositories found')

    await user.keyboard('{Escape}')
    expect(status()).toBeEmptyDOMElement()

    await user.click(input())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('Should filter case-insensitively and offer to add custom text', async () => {
    const user = setupFake()
    render(<Harness allowCustom />)

    await user.type(input(), 'BET')
    pause()

    expect(names()).toStrictEqual(['DEFRA/beta', 'Add BET'])
    expect(status()).toHaveTextContent('1 repository found')
  })

  test('Should not offer to add text that matches an option exactly', async () => {
    const user = userEvent.setup()
    render(<Harness allowCustom />)

    await user.type(input(), 'defra/beta')

    expect(names()).toStrictEqual(['DEFRA/beta'])
  })

  test('Should say when nothing matches', async () => {
    const user = setupFake()
    const { rerender } = render(<Harness />)

    await user.type(input(), 'zzz')
    pause()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-expanded', 'false')
    expect(status()).toHaveTextContent('No matching repositories')
    expect(status()).not.toHaveTextContent('press Enter')

    rerender(<Harness allowCustom />)
    pause()

    expect(status()).toHaveTextContent(
      'No matching repositories, press Enter to add'
    )
  })

  test('Should pass a chosen option to onSelect and close', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.click(input())
    await user.click(screen.getByRole('option', { name: 'DEFRA/gamma' }))

    expect(onSelect).toHaveBeenCalledWith('DEFRA/gamma', { custom: false })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  test('Should pass the typed text as custom from the Add option', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Harness allowCustom onSelect={onSelect} addText={(t) => `New ${t}`} />
    )

    await user.type(input(), 'x/y')
    await user.click(screen.getByRole('option', { name: 'New x/y' }))

    expect(onSelect).toHaveBeenCalledWith('x/y', { custom: true })
  })

  test('Should move with the arrow keys, wrapping at both ends', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(input())
    const options = screen.getAllByRole('option')

    await user.keyboard('{ArrowDown}')
    expect(input()).toHaveAttribute('aria-activedescendant', options[0].id)
    await user.keyboard('{ArrowUp}')
    expect(input()).toHaveAttribute('aria-activedescendant', options[2].id)
    await user.keyboard('{ArrowDown}')
    expect(input()).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  test('Should open with ArrowDown and with ArrowUp from the ends', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    input().focus()

    await user.keyboard('{ArrowDown}')
    expect(input()).toHaveAttribute('aria-expanded', 'true')
    expect(input()).toHaveAttribute(
      'aria-activedescendant',
      screen.getAllByRole('option')[0].id
    )

    await user.keyboard('{Escape}')
    await user.keyboard('{ArrowUp}')
    expect(input()).toHaveAttribute(
      'aria-activedescendant',
      screen.getAllByRole('option')[2].id
    )
  })

  test('Should do nothing on arrow keys when there is nothing to choose', async () => {
    const user = userEvent.setup()
    render(<Harness options={[]} />)
    input().focus()

    await user.keyboard('{ArrowDown}{ArrowUp}')

    expect(input()).toHaveAttribute('aria-expanded', 'false')
  })

  test('Should choose the active option with Enter without submitting', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onSubmit = vi.fn()
    render(<Harness onSelect={onSelect} onSubmit={onSubmit} />)
    await user.click(input())

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith('DEFRA/beta', { custom: false })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('Should select the typed text on Enter when custom text is allowed', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onSubmit = vi.fn()
    render(<Harness allowCustom onSelect={onSelect} onSubmit={onSubmit} />)

    await user.type(input(), ' a/b {Enter}')

    expect(onSelect).toHaveBeenCalledWith('a/b', { custom: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('Should leave Enter to the form when there is nothing to select', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await user.type(input(), 'zzz{Enter}')
    await user.clear(input())
    await user.type(input(), '{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  test('Should close on Escape, then clear, and close on blur', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(input(), 'defra')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input()).toHaveValue('defra')

    await user.keyboard('{Escape}')
    expect(input()).toHaveValue('')

    await user.click(input())
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.tab()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  test('Should describe the input with its error and mark it invalid', () => {
    render(<Harness hint="Hint" errorMessage="Enter a repository" />)

    expect(input()).toHaveAccessibleDescription(
      'Hint Error: Enter a repository'
    )
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(input()).toHaveClass('govuk-input--error')
  })

  test('Should generate an id and forward the ref and extra props', () => {
    const ref = { current: null }
    render(
      <Combobox
        label="Repository"
        options={[]}
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        inputRef={ref}
        placeholder="owner/name"
      />
    )

    expect(ref.current).toBe(input())
    expect(input()).toHaveAttribute('placeholder', 'owner/name')
    expect(input().id).not.toBe('')
  })

  test('Should have no accessibility violations', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness allowCustom hint="Hint" />)

    expect(await axeViolations(container)).toStrictEqual([])

    await user.type(input(), 'a')
    await user.keyboard('{ArrowDown}')

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
