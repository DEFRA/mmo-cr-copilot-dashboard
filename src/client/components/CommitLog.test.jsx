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
    expect(
      screen.queryByRole('button', { name: /^Edit classification/ })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(
      screen.getByText(/editable once the PR is merged/)
    ).toBeInTheDocument()
  })

  test('Should offer an edit button per commit once merged, but no selector until it is pressed', () => {
    renderLog({ editable: true })

    expect(
      screen.getAllByRole('button', { name: /^Edit classification/ })
    ).toHaveLength(2)
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  test('Should reveal the selector with confirm and cancel for the chosen row only', async () => {
    renderLog({ editable: true })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Edit classification for commit a1b2c3d'
      })
    )

    const select = screen.getByRole('combobox', {
      name: 'Classification for commit a1b2c3d'
    })
    expect(select).toHaveValue('Copilot-assisted')
    expect(select).toHaveFocus()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(
      screen.getByRole('button', {
        name: 'Save classification for commit a1b2c3d'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Cancel editing classification for commit a1b2c3d'
      })
    ).toBeInTheDocument()
  })

  test('Should submit the chosen classification for the right commit on confirm', async () => {
    const onChangeClassification = vi.fn().mockResolvedValue({})
    renderLog({ editable: true, onChangeClassification })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Edit classification for commit d4e5f6a'
      })
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: 'Classification for commit d4e5f6a'
      }),
      'Rebase'
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Save classification for commit d4e5f6a'
      })
    )

    await waitFor(() =>
      expect(onChangeClassification).toHaveBeenCalledWith({
        repository: 'DEFRA/mmo-cr-copilot-dashboard',
        prNumber: 42,
        commit: 'd4e5f6a',
        classification: 'Rebase'
      })
    )

    const editButton = await screen.findByRole('button', {
      name: 'Edit classification for commit d4e5f6a'
    })
    expect(editButton).toHaveFocus()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  test('Should discard the drafted classification on cancel', async () => {
    const onChangeClassification = vi.fn().mockResolvedValue({})
    renderLog({ editable: true, onChangeClassification })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Edit classification for commit a1b2c3d'
      })
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: 'Classification for commit a1b2c3d'
      }),
      'Dependabot'
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Cancel editing classification for commit a1b2c3d'
      })
    )

    expect(onChangeClassification).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Edit classification for commit a1b2c3d'
      })
    ).toHaveFocus()
  })

  test('Should not record an unchanged classification', async () => {
    const onChangeClassification = vi.fn().mockResolvedValue({})
    renderLog({ editable: true, onChangeClassification })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Edit classification for commit a1b2c3d'
      })
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Save classification for commit a1b2c3d'
      })
    )

    expect(onChangeClassification).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  test('Should close an open row when another row is opened', async () => {
    const onChangeClassification = vi.fn().mockResolvedValue({})
    renderLog({ editable: true, onChangeClassification })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Edit classification for commit a1b2c3d'
      })
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: 'Classification for commit a1b2c3d'
      }),
      'Rebase'
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Edit classification for commit d4e5f6a'
      })
    )

    expect(onChangeClassification).not.toHaveBeenCalled()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(
      screen.getByRole('combobox', {
        name: 'Classification for commit d4e5f6a'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Edit classification for commit a1b2c3d'
      })
    ).toBeInTheDocument()
  })

  test('Should surface a rejected change and keep the row in edit mode', async () => {
    const onChangeClassification = vi
      .fn()
      .mockRejectedValue(new Error('is not merged'))
    renderLog({ editable: true, onChangeClassification })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Edit classification for commit a1b2c3d'
      })
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: 'Classification for commit a1b2c3d'
      }),
      'Dependabot'
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Save classification for commit a1b2c3d'
      })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('is not merged')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', {
        name: 'Classification for commit a1b2c3d'
      })
    ).toHaveValue('Dependabot')
  })
})
