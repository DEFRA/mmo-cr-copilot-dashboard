import { useEffect } from 'react'

/** Warns before leaving with unsaved changes and reports dirtiness upwards. */
export function useUnsavedGuard(dirty, onDirtyChange) {
  useEffect(() => {
    if (!dirty) {
      return undefined
    }
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
}
