import { Component } from 'react'

import { Panel } from './dashboard/Panel.jsx'
import { PanelState } from './dashboard/PanelState.jsx'

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
          <Panel
            title="This section failed to render."
            family="risk"
            icon="warning"
          >
            <PanelState state="error" errorMessage="Try refreshing the page." />
          </Panel>
        )
      )
    }
    return this.props.children
  }
}
