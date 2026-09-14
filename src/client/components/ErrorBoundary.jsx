import { Component } from 'react'

/**
 * Class-based error boundary (the one React API that still requires a class).
 * Wraps risky chart/render subtrees so a single failure can't blank the app.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Dashboard render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="panel p-6 text-center text-sm text-[var(--color-danger)]">
            <p className="m-0 font-semibold">This section failed to render.</p>
            <p className="m-0 mt-1 text-[var(--color-text-muted)]">
              Try refreshing the page.
            </p>
          </div>
        )
      )
    }
    return this.props.children
  }
}
