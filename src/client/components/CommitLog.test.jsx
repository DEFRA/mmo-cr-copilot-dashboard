import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CommitLog } from './CommitLog'

const COMMITS = [
  {
    commit: 'a1b2c3d',
    committedAt: '2026-01-15T09:45:00.000Z',
    author: 'ada',
    subject: 'Add cycle time scatter',
    classification: 'Copilot-assisted',
    linesAdded: 220,
    linesDeleted: 20,
    linesTouched: 240,
    netLines: 200
  },
  {
    commit: 'd4e5f6a',
    committedAt: '2026-01-15T09:50:00.000Z',
    author: 'bob',
    subject: 'Fix axis labels',
    classification: 'Human-authored',
    linesAdded: 40,
    linesDeleted: 20,
    linesTouched: 60,
    netLines: 20
  }
]

describe('#CommitLog', () => {
  const renderLog = (props = {}) =>
    render(
      <CommitLog
        repository="DEFRA/mmo-cr-copilot-dashboard"
        prNumber={42}
        commits={COMMITS}
        onChangeClassification={vi.fn()}
        {...props}
      />
    )

  test('Should list every commit', () => {
    renderLog()
    const table = within(screen.getByRole('table'))

    expect(table.getByText('a1b2c3d')).toBeInTheDocument()
    expect(table.getByText('Fix axis labels')).toBeInTheDocument()
  })

  test('Should be read-only for a pull request that is not merged', () => {
    renderLog()

    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(
      screen.getByText(/editable once the PR is merged/)
    ).toBeInTheDocument()
  })

  test('Should offer a classification selector per commit once merged', () => {
    renderLog({ editable: true })

    expect(
      screen.getByRole('combobox', {
        name: 'Classification for commit a1b2c3d'
      })
    ).toHaveValue('Copilot-assisted')
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
  })

  test('Should submit the chosen classification for the right commit', async () => {
    const onChangeClassification = vi.fn().mockResolvedValue({})
    renderLog({ editable: true, onChangeClassification })

    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: 'Classification for commit d4e5f6a'
      }),
      'Rebase'
    )

    await waitFor(() =>
      expect(onChangeClassification).toHaveBeenCalledWith({
        repository: 'DEFRA/mmo-cr-copilot-dashboard',
        prNumber: 42,
        commit: 'd4e5f6a',
        classification: 'Rebase'
      })
    )
  })

  test('Should surface a rejected change without losing the table', async () => {
    const onChangeClassification = vi
      .fn()
      .mockRejectedValue(new Error('is not merged'))
    renderLog({ editable: true, onChangeClassification })

    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: 'Classification for commit a1b2c3d'
      }),
      'Dependabot'
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('is not merged')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
