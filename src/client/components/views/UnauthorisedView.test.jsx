import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { UnauthorisedView } from './UnauthorisedView'

const mockMotion = (reduced) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))

afterEach(() => vi.restoreAllMocks())

describe('#UnauthorisedView', () => {
  beforeEach(() => mockMotion(false))

  test('Should explain that the account is in no project group', () => {
    render(<UnauthorisedView reason="no-access" userName="Grace Hopper" />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'You Do Not Have Access to This Service'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/You are signed in as Grace Hopper, but/)
    ).toBeInTheDocument()
    expect(screen.getByText(/ask a project admin to add your/)).toBeVisible()
  })

  test('Should not claim a name it does not have', () => {
    render(<UnauthorisedView />)

    expect(screen.getByText(/^You are signed in, but/)).toBeInTheDocument()
  })

  test('Should answer a missing and a forbidden project the same way', () => {
    render(<UnauthorisedView reason="project" />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'You Do Not Have Access to This Project'
      })
    ).toBeInTheDocument()
    expect(screen.getByText(/may not exist, or your account/)).toBeVisible()
  })

  test('Should link to another project only when there is one', () => {
    const { rerender } = render(<UnauthorisedView reason="project" />)
    expect(screen.queryByRole('link', { name: /overview/ })).toBeNull()

    rerender(
      <UnauthorisedView
        reason="project"
        fallbackName="Alpha"
        fallbackHref="#/projects/alpha/overview"
      />
    )

    expect(
      screen.getByRole('link', { name: 'Go to the Alpha overview' })
    ).toHaveAttribute('href', '#/projects/alpha/overview')
  })

  test('Should offer sign out and move focus to the heading', () => {
    render(<UnauthorisedView />)

    expect(
      screen.getByRole('link', { name: 'Sign out and use a different account' })
    ).toHaveAttribute('href', '/logout')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  test('Should title the document after the page', () => {
    render(<UnauthorisedView reason="project" />)

    expect(document.title).toBe(
      'You Do Not Have Access to This Project – Copilot Delivery Insights'
    )
  })

  test('Should hide the decorative scene from assistive technology', () => {
    const { container } = render(<UnauthorisedView />)

    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(screen.queryByRole('img')).toBeNull()
  })

  test('Should let the user pause and play the motion (WCAG 2.2.2)', async () => {
    const { container } = render(<UnauthorisedView />)
    const root = container.firstElementChild
    expect(root).not.toHaveClass('app-denied--paused')

    await userEvent.click(
      screen.getByRole('button', { name: 'Pause animation' })
    )
    expect(root).toHaveClass('app-denied--paused')

    await userEvent.click(
      screen.getByRole('button', { name: 'Play animation' })
    )
    expect(root).not.toHaveClass('app-denied--paused')
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = render(<UnauthorisedView reason="no-access" />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})

describe('#UnauthorisedView with reduced motion', () => {
  test('Should start still, and play only when asked', async () => {
    mockMotion(true)
    const { container } = render(<UnauthorisedView />)

    expect(container.firstElementChild).toHaveClass('app-denied--paused')
    await userEvent.click(
      screen.getByRole('button', { name: 'Play animation' })
    )
    expect(container.firstElementChild).not.toHaveClass('app-denied--paused')
  })
})
