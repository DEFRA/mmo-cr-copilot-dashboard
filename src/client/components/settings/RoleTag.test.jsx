import { render, screen } from '@testing-library/react'

import { axeViolations } from '#/test-helpers/axe.js'
import { RoleTag } from './RoleTag'

describe('#RoleTag', () => {
  test.each([
    ['project-user', false, 'Project User', 'govuk-tag--grey'],
    ['project-admin', false, 'Project Admin', 'govuk-tag--teal'],
    ['dashboard-admin', false, 'Dashboard Admin', 'govuk-tag--magenta'],
    ['project-user', true, 'Dashboard Admin', 'govuk-tag--magenta']
  ])(
    'Should tag role %s (dashboard admin %s) as %s',
    (role, isDashboardAdmin, text, colour) => {
      render(<RoleTag role={role} isDashboardAdmin={isDashboardAdmin} />)

      expect(screen.getByText('Your role')).toBeInTheDocument()
      expect(screen.getByText(text)).toHaveClass('govuk-tag', colour)
    }
  )

  test.each([null, undefined, 'something-else'])(
    'Should render nothing for the role %s',
    (role) => {
      const { container } = render(<RoleTag role={role} />)

      expect(container).toBeEmptyDOMElement()
    }
  )

  test('Should have no axe violations', async () => {
    const { container } = render(<RoleTag role="project-admin" />)

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
