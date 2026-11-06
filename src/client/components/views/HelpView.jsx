import { useEffect } from 'react'

import { BackLink, Details, Table } from '../govuk'
import { isPlainClick } from '../govuk/utils.js'
import { toHash } from '../../lib/routes'

export const SUPPORT_EMAIL = '[support-email-placeholder@defra.gov.uk]'
export const DASHBOARD_URL =
  'https://mmo-cr-copilot-dashboard.ext-test.cdp.defra.gov.uk/'
export const INGEST_URL = `${DASHBOARD_URL}api/ingest`

const WORKFLOW_PATH = '.github/workflows/copilot-analytics.yml'

// The `${{ }}` expressions are workflow syntax to show, not JavaScript templates.
/* eslint-disable no-template-curly-in-string */
const WORKFLOW_LINES = [
  'name: Copilot Analytics',
  '',
  'on:',
  '  pull_request:',
  '    branches: [main]',
  '    types: [opened, reopened, synchronize, ready_for_review, closed]',
  '  workflow_dispatch:',
  '    inputs:',
  '      pr_number:',
  "        description: 'Pull request number to collect analytics for'",
  '        required: true',
  '        type: string',
  '',
  'permissions:',
  '  contents: read',
  '  pull-requests: read',
  '',
  'jobs:',
  '  collect-and-publish:',
  '    permissions:',
  '      contents: read',
  '      pull-requests: read',
  '      id-token: write',
  '    uses: DEFRA/mmo-cr-devops-common/.github/workflows/copilot-analytics.yml@main',
  '    with:',
  "      pr-number: ${{ inputs.pr_number || '' }}",
  '      ingest-url: ${{ vars.COPILOT_ANALYTICS_INGEST_URL }}'
]
/* eslint-enable no-template-curly-in-string */

const EXTENSION_SETTINGS = [
  [
    'defraAiAttribution.autoEnable',
    'false',
    'Turn attribution on for every git repository you open. When off, you are asked once per repository.'
  ],
  [
    'defraAiAttribution.captureUsage',
    'ask',
    'Record which Copilot model and how many tokens a commit used: ask, on or off. Turning it on needs a window reload.'
  ],
  [
    'defraAiAttribution.captureCompletions',
    'true',
    'Track accepted inline suggestions by wrapping the accept keys.'
  ],
  [
    'defraAiAttribution.installAgentHooks',
    'true',
    "Install the user-level Copilot agent hook that attributes the agent's edits."
  ],
  [
    'defraAiAttribution.notifyOnCommit',
    'statusBar',
    'How each commit reports what it recorded: statusBar, notification or off.'
  ],
  [
    'defraAiAttribution.excludeGlobs',
    '[]',
    'Extra file patterns that are never attributed, on top of the built-in ones and .analyticsignore.'
  ]
]

const CHECKLIST = [
  'The project appears in the project switcher.',
  'Every repository is mapped to the project in Settings, under Repositories.',
  `The caller workflow ${WORKFLOW_PATH} is on the default branch of each repository.`,
  'The COPILOT_ANALYTICS_INGEST_URL variable is set in each repository.',
  'The workflow job has id-token: write.',
  'Entra groups are mapped to Project Admin and Project User in Settings, under Role Mappings.',
  'Each repository can have one SonarCloud project key, set by a project admin in Settings, under Repositories. The project has its Jira key, if you use Jira.',
  'A pull request has been opened or updated and the workflow run summary says the payload was published.',
  'The pull request shows on the project overview.'
]

/** How to send data to the dashboard, and where to get help. */
export function HelpView({ onBack, isAdmin = false, onOnboardProject }) {
  useEffect(() => {
    document.title = 'Help – Copilot Delivery Insights'
  }, [])

  const onboardingHref = toHash({ level: 'onboarding' })

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <BackLink
          href={toHash({ level: 'overview' })}
          onClick={onBack}
          className="govuk-!-margin-bottom-6"
        >
          Back
        </BackLink>
        <h1 className="govuk-heading-xl">Help</h1>
        <p className="govuk-body-l">
          How to send pull request analytics to this dashboard and record how
          Copilot was used.
        </p>

        <section aria-labelledby="help-workflow">
          <h2 className="govuk-heading-l" id="help-workflow">
            Add the GitHub Actions Workflow
          </h2>
          <p className="govuk-body">
            Each repository calls a shared workflow in{' '}
            <code>DEFRA/mmo-cr-devops-common</code>. It measures each pull
            request and sends the result to this dashboard. Add this file to the
            repository as <code>{WORKFLOW_PATH}</code>:
          </p>
          <pre className="app-code-block" tabIndex={0}>
            <code>{WORKFLOW_LINES.join('\n')}</code>
          </pre>

          <h3 className="govuk-heading-m">Set the Ingest URL</h3>
          <p className="govuk-body">
            In the repository settings, add an Actions variable named{' '}
            <code>COPILOT_ANALYTICS_INGEST_URL</code> with the ingest address of{' '}
            <a className="govuk-link" href={DASHBOARD_URL}>
              Copilot analytics | mmo-cr-copilot-dashboard
            </a>
            :
          </p>
          <p className="govuk-body">
            <code>{INGEST_URL}</code>
          </p>
          <p className="govuk-body">
            The address must use HTTPS. Map the repository to a project before
            you add the workflow, because data from an unmapped repository is
            held back.
          </p>

          <h3 className="govuk-heading-m">How the Workflow Signs In</h3>
          <p className="govuk-body">
            The workflow does not need a password. With{' '}
            <code>id-token: write</code> on the job, GitHub gives it a
            short-lived OIDC token for that run. The dashboard checks that the
            token came from the DEFRA organisation, from the shared workflow, on
            a pull request or manual run, and that the repository is mapped to a
            project.
          </p>
          <Details summary="If the job cannot request an OIDC token">
            <p className="govuk-body">
              Without <code>id-token: write</code> the workflow falls back to a
              shared secret, sent from the <code>COPILOT_INGEST_TOKEN</code>{' '}
              repository secret. Ask the service team for it. This fallback will
              be switched off once every repository uses OIDC.
            </p>
          </Details>
        </section>

        <section aria-labelledby="help-extension">
          <h2 className="govuk-heading-l" id="help-extension">
            Set Up the VS Code Attribution Extension
          </h2>
          <p className="govuk-body">
            The DEFRA AI Attribution extension records how many lines in each
            commit Copilot wrote. It saves counts in an <code>.analytics/</code>{' '}
            folder in the commit. It never saves code, prompts, names or emails.
          </p>
          <ol className="govuk-list govuk-list--number">
            <li>Install the DEFRA AI Attribution extension in VS Code.</li>
            <li>
              Open the repository and choose <strong>Enable</strong> when asked,
              or run{' '}
              <strong>DEFRA AI Attribution: Enable for This Repository</strong>.
            </li>
            <li>
              Choose whether to record the Copilot model and token usage when
              asked. You can change this later.
            </li>
            <li>
              Commit as usual and push. The workflow reads the{' '}
              <code>.analytics/</code> folder from your commits.
            </li>
          </ol>
          <Table
            caption="Extension settings"
            captionSize="m"
            head={[
              { id: 'setting', label: 'Setting' },
              { id: 'default', label: 'Default' },
              { id: 'effect', label: 'What it does' }
            ]}
            rows={EXTENSION_SETTINGS.map(([setting, fallback, effect]) => ({
              id: setting,
              cells: [
                <code key="s">{setting}</code>,
                <code key="d">{fallback}</code>,
                effect
              ]
            }))}
          />
        </section>

        <section aria-labelledby="help-checklist">
          <h2 className="govuk-heading-l" id="help-checklist">
            Checklist for a New Project
          </h2>
          <p className="govuk-body">
            Check each of these once a project has been onboarded:
          </p>
          <ul className="govuk-list govuk-list--bullet">
            {CHECKLIST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {isAdmin && (
            <p className="govuk-body">
              <a
                className="govuk-link"
                href={onboardingHref}
                onClick={(event) => {
                  if (!onOnboardProject || !isPlainClick(event)) return
                  event.preventDefault()
                  onOnboardProject()
                }}
              >
                Onboard a project
              </a>
            </p>
          )}
        </section>

        <section aria-labelledby="help-support">
          <h2 className="govuk-heading-l" id="help-support">
            Get Support
          </h2>
          <p className="govuk-body">
            If something here does not work, or you need access, contact the
            service team:
          </p>
          <p className="govuk-body">Email: {SUPPORT_EMAIL}</p>
        </section>
      </div>
    </div>
  )
}
