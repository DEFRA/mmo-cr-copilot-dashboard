import { render, screen } from '@testing-library/react'

import { Panel } from './Panel.jsx'

describe('#Panel', () => {
  test('Should render the title and subtitle', () => {
    render(<Panel title="Adoption" subtitle="Last sprint" />)

    expect(
      screen.getByRole('heading', { name: 'Adoption' })
    ).toBeInTheDocument()
    expect(screen.getByText('Last sprint')).toBeInTheDocument()
  })

  test('Should render children when populated', () => {
    render(
      <Panel title="Adoption">
        <p>75%</p>
      </Panel>
    )

    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  test('Should hide children while loading', () => {
    render(
      <Panel title="Adoption" state="loading">
        <p>75%</p>
      </Panel>
    )

    expect(screen.queryByText('75%')).not.toBeInTheDocument()
  })

  test('Should explain the empty state', () => {
    render(<Panel title="Adoption" state="empty" />)

    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  test('Should explain the error state without leaking internals', () => {
    render(<Panel title="Adoption" state="error" />)

    expect(screen.getByText("Couldn't load metrics")).toBeInTheDocument()
    expect(
      screen.getByText('Something went wrong while rendering this panel.')
    ).toBeInTheDocument()
  })

  test('Should render an action in the header', () => {
    render(<Panel title="Adoption" action={<button>Export</button>} />)

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  test('Should omit the header when there is no title or action', () => {
    render(<Panel>content</Panel>)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
