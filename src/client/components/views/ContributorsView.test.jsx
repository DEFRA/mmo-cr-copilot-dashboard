import { render, screen, within } from '@testing-library/react'

import {
  buildCommit,
  buildPayloadFromCommits
} from '#/test-helpers/payload-fixture.js'
import { ContributorsView } from './ContributorsView'

const payloads = [
  buildPayloadFromCommits(
    [
      buildCommit({ commit: 'a1', author: 'zara', linesAdded: 500 }),
      buildCommit({ commit: 'b1', author: 'adam', linesAdded: 10 })
    ],
    { prNumber: 1 }
  )
]

const names = () =>
  within(screen.getByRole('table'))
    .getAllByRole('button', { name: /^(adam|zara)$/ })
    .map((b) => b.textContent)

describe('#ContributorsView', () => {
  test('Should frame AI-native contributors for diagnosis, sorted by name', () => {
    render(
      <ContributorsView
        payloads={payloads}
        onOpenContributor={vi.fn()}
        projectType="ai-native"
      />
    )

    expect(screen.getByText('For diagnosis, not comparison.')).toBeVisible()
    expect(names()).toEqual(['adam', 'zara'])
    expect(
      screen.queryByRole('columnheader', { name: /assist rate/i })
    ).not.toBeInTheDocument()
  })

  test('Should keep the assist rate for AI-adopted projects', () => {
    render(<ContributorsView payloads={payloads} onOpenContributor={vi.fn()} />)

    expect(
      screen.getByRole('columnheader', { name: /commit assist rate/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByText('For diagnosis, not comparison.')
    ).not.toBeInTheDocument()
  })
})
