import { render, screen } from '@testing-library/react'

import { ErrorBoundary } from './ErrorBoundary.jsx'

function Exploding() {
  throw new Error('chart blew up')
}

describe('#ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; the boundary logs its own message too.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  test('Should render its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    )

    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  test('Should render a neutral message when a child throws', () => {
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>
    )

    expect(
      screen.getByText('This section failed to render.')
    ).toBeInTheDocument()
  })

  test('Should not leak the error message to the page', () => {
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>
    )

    expect(screen.queryByText(/chart blew up/)).not.toBeInTheDocument()
  })

  test('Should render a supplied fallback instead', () => {
    render(
      <ErrorBoundary fallback={<p>Chart unavailable</p>}>
        <Exploding />
      </ErrorBoundary>
    )

    expect(screen.getByText('Chart unavailable')).toBeInTheDocument()
  })
})
