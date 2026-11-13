import { Tag } from '../govuk'
import { ROLE_TAG, effectiveRole } from '../../lib/roles'

/** The caller's role on the active project, as a tag. */
export function RoleTag({ role, isDashboardAdmin = false }) {
  const tag = ROLE_TAG[effectiveRole(role, isDashboardAdmin)]
  if (!tag) {
    return null
  }

  return (
    <p className="app-role-tag">
      <span className="app-role-tag__label">Your role</span>
      <Tag colour={tag.colour}>{tag.text}</Tag>
    </p>
  )
}
