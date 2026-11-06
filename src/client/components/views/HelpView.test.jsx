import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { HelpView, INGEST_URL, SUPPORT_EMAIL } from './HelpView.jsx'

describe('#HelpView', () => {
  test('Should title the page and the document', () => {
    render(<HelpView />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Help' })
    ).toBeInTheDocument()
    expect(document.title).toBe('Help – Copilot Delivery Insights')
  })

  test('Should show the caller workflow for the shared DEFRA workflow', () => {
    render(<HelpView />)

    const snippet = screen.getByText(/name: Copilot Analytics/).closest('pre')
    expect(snippet).toHaveAttribute('tabindex', '0')
    expect(snippet).toHaveTextContent(
      'uses: DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics.yml@main'
    )
    expect(snippet).toHaveTextContent('id-token: write')
    expect(snippet).toHaveTextContent(
      // eslint-disable-next-line no-template-curly-in-string
      'ingest-url: ${{ vars.COPILOT_ANALYTICS_INGEST_URL }}'
    )
    expect(
      screen.getAllByText('.github/workflows/copilot-analytics.yml').length
    ).toBeGreaterThan(0)
  })

  test('Should tell the reader the ingest URL for this dashboard', () => {
    render(<HelpView />)

    expect(screen.getByText(INGEST_URL)).toBeInTheDocument()
    expect(INGEST_URL).toBe(
      'https://mmo-cr-copilot-dashboard.ext-test.cdp.defra.gov.uk/api/ingest'
    )
    expect(
      screen.getByRole('link', {
        name: 'Copilot analytics | mmo-cr-copilot-dashboard'
      })
    ).toHaveAttribute(
      'href',
      'https://mmo-cr-copilot-dashboard.ext-test.cdp.defra.gov.uk/'
    )
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'How the Workflow Signs In'
      })
    ).toBeInTheDocument()
    expect(screen.getByText(/short-lived OIDC token/)).toBeInTheDocument()
  })

  test('Should list every extension setting with its default', () => {
    render(<HelpView />)

    const table = screen.getByRole('table', { name: 'Extension settings' })
    for (const setting of [
      'autoEnable',
      'captureUsage',
      'captureCompletions',
      'installAgentHooks',
      'notifyOnCommit',
      'excludeGlobs'
    ]) {
      expect(
        within(table).getByText(`defraAiAttribution.${setting}`)
      ).toBeInTheDocument()
    }
    const usage = within(table)
      .getByText('defraAiAttribution.captureUsage')
      .closest('tr')
    expect(within(usage).getByText('ask')).toBeInTheDocument()
  })

  test('Should give a checklist for a newly onboarded project', () => {
    render(<HelpView />)

    const section = screen
      .getByRole('heading', { name: 'Checklist for a New Project' })
      .closest('section')
    expect(within(section).getAllByRole('listitem').length).toBeGreaterThan(5)
    expect(
      within(section).getByText(/workflow run summary says the payload/)
    ).toBeInTheDocument()
  })

  test('Should show a placeholder support address for now', () => {
    render(<HelpView />)

    expect(SUPPORT_EMAIL).toBe('[support-email-placeholder@defra.gov.uk]')
    expect(screen.getByText(`Email: ${SUPPORT_EMAIL}`)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: SUPPORT_EMAIL })
    ).not.toBeInTheDocument()
  })

  test('Should not offer onboarding to anyone but a dashboard admin', () => {
    render(<HelpView onOnboardProject={vi.fn()} />)

    expect(
      screen.queryByRole('link', { name: 'Onboard a project' })
    ).not.toBeInTheDocument()
  })

  test('Should offer onboarding to a dashboard admin', async () => {
    const onOnboardProject = vi.fn()
    render(<HelpView isAdmin onOnboardProject={onOnboardProject} />)

    const link = screen.getByRole('link', { name: 'Onboard a project' })
    expect(link).toHaveAttribute('href', '#/onboarding')

    await userEvent.click(link)

    expect(onOnboardProject).toHaveBeenCalledTimes(1)
  })

  test('Should leave a modified click on the onboarding link to the browser', async () => {
    const onOnboardProject = vi.fn()
    render(<HelpView isAdmin onOnboardProject={onOnboardProject} />)

    const user = userEvent.setup()
    await user.keyboard('{Control>}')
    await user.click(screen.getByRole('link', { name: 'Onboard a project' }))
    await user.keyboard('{/Control}')

    expect(onOnboardProject).not.toHaveBeenCalled()
  })

  test('Should still link to onboarding without a handler', async () => {
    render(<HelpView isAdmin />)

    await userEvent.click(
      screen.getByRole('link', { name: 'Onboard a project' })
    )

    expect(window.location.hash).toBe('#/onboarding')
  })

  test('Should call onBack from the back link', async () => {
    const onBack = vi.fn()
    render(<HelpView onBack={onBack} />)

    await userEvent.click(screen.getByRole('link', { name: 'Back' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('Should lay the page out in the centred reading column', () => {
    const { container } = render(<HelpView />)

    expect(container.firstElementChild).toHaveClass('app-reading')
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = render(<HelpView isAdmin />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
