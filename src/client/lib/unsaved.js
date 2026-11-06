export const UNSAVED_CHANGES_MESSAGE =
  'You have unsaved changes to the Jira workflow. Leave without saving them?'

/** True when there is nothing to lose, or the user agrees to discard it. */
export const confirmDiscard = (dirty) =>
  !dirty || window.confirm(UNSAVED_CHANGES_MESSAGE)
