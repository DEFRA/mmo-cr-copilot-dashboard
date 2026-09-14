import neostandard from 'neostandard'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...neostandard({
    env: ['node', 'browser', 'vitest'],
    ignores: [...neostandard.resolveIgnoresFromGitignore(), '.public'],
    noStyle: true
  }),
  {
    // Every subscription, timer and fetch in this app lives in a hook, so the
    // rules of hooks are load-bearing rather than stylistic. The React Compiler
    // rules in this plugin's `recommended` preset are deliberately not enabled:
    // they flag patterns this app uses intentionally.
    files: ['src/client/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    // Exposed globally by .vite/setup-files.js
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { fetchMock: 'readonly' }
    }
  }
]
