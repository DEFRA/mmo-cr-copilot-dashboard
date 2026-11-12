import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { SprintPeriodPanel } from './SprintPeriodPanel'

const PROJECT = {
  slug: 'CRAR',
  name: 'Catch Recording',
  jira: { projectKeys: ['CRAR'] },
  sprintCalendar: { cadenceDays: 14, anchorDate: '2026-07-08T00:00:00.000Z' }
}
const URL = '/api/projects/CRAR/sprint-calendar'

const lengthInput = () =>
  screen.getByRole('textbox', { name: 'Sprint length in days' })
const dateField = (name) => screen.getByRole('textbox', { name })
const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Save sprint period' }))

async function enter({ length, day, month, year }) {
  if (length !== undefined) {
    await userEvent.clear(lengthInput())
    if (length) await userEvent.type(lengthInput(), length)
  }
  for (const [name, value] of [
    ['Day', day],
    ['Month', month],
    ['Year', year]
  ]) {
    if (value === undefined) continue
    await userEvent.clear(dateField(name))
    if (value) await userEvent.type(dateField(name), value)
  }
}

describe('#SprintPeriodPanel', () => {
  test('Should show the saved sprint period in the form', () => {
    render(<SprintPeriodPanel project={PROJECT} />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Sprint Period' })
    ).toBeInTheDocument()
    expect(screen.getByText('14 days, counted from 8 July 2026')).toBeVisible()
    expect(lengthInput()).toHaveValue('14')
    expect(dateField('Day')).toHaveValue('8')
    expect(dateField('Month')).toHaveValue('7')
    expect(dateField('Year')).toHaveValue('2026')
  })

  test('Should fall back to the default period for a project without one', () => {
    render(<SprintPeriodPanel project={{ ...PROJECT, sprintCalendar: null }} />)

    expect(lengthInput()).toHaveValue('14')
    expect(dateField('Day')).toHaveValue('8')
  })

  test('Should save a new period, announce it and tell the app', async () => {
    fetchMock.mockResponse(JSON.stringify({ slug: 'CRAR' }))
    const onSaved = vi.fn()
    render(<SprintPeriodPanel project={PROJECT} onSaved={onSaved} />)

    await enter({ length: '7', day: '2', month: '11', year: '2026' })
    await save()

    expect(
      await screen.findByText(
        'Sprint period saved. Sprints are 7 days long, counted from 2 November 2026.'
      )
    ).toBeVisible()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(URL)
    expect(options.method).toBe('PUT')
    expect(options.headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(JSON.parse(options.body)).toEqual({
      cadenceDays: 7,
      anchorDate: '2026-11-02T00:00:00.000Z'
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByText(/You have unsaved changes/)
    ).not.toBeInTheDocument()
  })

  test.each([
    [{ length: '' }, 'Enter the sprint length in days'],
    [
      { length: '31' },
      'Sprint length must be a whole number of days from 1 to 30'
    ],
    [{ day: '', month: '', year: '' }, 'Enter the date a sprint started'],
    [{ day: '31', month: '2' }, 'The sprint start date must be a real date']
  ])(
    'Should not save %o and explain why',
    async (input, message) => {
      render(<SprintPeriodPanel project={PROJECT} />)

      await enter(input)
      await save()

      expect(
        screen.getByRole('link', { name: message })
      ).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  test('Should show a refusal from the server', async () => {
    fetchMock.mockResponse(JSON.stringify({ message: 'no' }), { status: 403 })
    render(<SprintPeriodPanel project={PROJECT} />)

    await enter({ length: '10' })
    await save()

    expect(
      await screen.findByText('You do not have permission to do this')
    ).toBeVisible()
  })

  test('Should report unsaved changes and cancel them', async () => {
    const onDirtyChange = vi.fn()
    render(<SprintPeriodPanel project={PROJECT} onDirtyChange={onDirtyChange} />)

    await enter({ length: '10' })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByText(/You have unsaved changes/)).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel changes' }))

    expect(lengthInput()).toHaveValue('14')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  test('Should say when the Jira board sets the sprints', () => {
    render(
      <SprintPeriodPanel
        project={{ ...PROJECT, jira: { ...PROJECT.jira, boardId: 7 } }}
      />
    )

    expect(
      screen.getByText(/takes its sprints from its Jira board/)
    ).toBeVisible()
  })

  test('Should load a newly saved period from the project', async () => {
    const { rerender } = render(<SprintPeriodPanel project={PROJECT} />)

    rerender(
      <SprintPeriodPanel
        project={{
          ...PROJECT,
          sprintCalendar: {
            cadenceDays: 21,
            anchorDate: '2026-09-01T00:00:00.000Z'
          }
        }}
      />
    )

    await waitFor(() => expect(lengthInput()).toHaveValue('21'))
    expect(dateField('Month')).toHaveValue('9')
  })

  test('Should have no axe violations, with or without errors', async () => {
    const { container } = render(<SprintPeriodPanel project={PROJECT} />)
    expect(await axeViolations(container)).toStrictEqual([])

    await enter({ length: '' })
    await save()
    expect(await axeViolations(container)).toStrictEqual([])
  })
})
