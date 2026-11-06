import { statusCodes } from '../constants/status-codes.js'

const HOME = { href: '/', text: 'Go to the dashboard' }
const SIGN_IN = { href: '/login', text: 'Try signing in again' }
const SIGN_OUT = { href: '/logout', text: 'Sign out' }

// Copy is fixed per status so upstream error detail never reaches the page.
const ERROR_PAGES = {
  [statusCodes.unauthorized]: {
    kind: 'locked',
    pageTitle: 'Sign-in did not complete',
    heading: 'Sign-in did not complete',
    message:
      'We could not confirm who you are, so the dashboard stayed closed. This is usually temporary.',
    primary: SIGN_IN,
    secondary: SIGN_OUT
  },
  [statusCodes.forbidden]: {
    kind: 'locked',
    pageTitle: 'You do not have access yet',
    heading: 'You do not have access yet',
    message:
      'You are signed in, but your account is not in a group that can see this dashboard. Ask a dashboard admin to add you to the right access group, then sign in again.',
    primary: SIGN_IN,
    secondary: SIGN_OUT
  },
  [statusCodes.notFound]: {
    kind: 'lost',
    pageTitle: 'Page not found',
    heading: 'Page not found',
    message:
      'If you typed the web address, check it is correct. If you pasted it, check you copied the whole address.',
    primary: HOME
  },
  [statusCodes.badRequest]: {
    kind: 'lost',
    pageTitle: 'Bad request',
    heading: 'That request did not make sense',
    message: 'Go back to the dashboard and try again.',
    primary: HOME
  }
}

const FALLBACK_PAGE = {
  kind: 'storm',
  pageTitle: 'Something went wrong',
  heading: 'Something went wrong',
  message: 'Try again in a few minutes.',
  primary: HOME
}

export const errorPageFor = (statusCode) =>
  ERROR_PAGES[statusCode] ?? FALLBACK_PAGE

export function catchAll(request, h) {
  const { response } = request

  if (!('isBoom' in response)) {
    return h.continue
  }

  const statusCode = response.output.statusCode

  if (statusCode >= statusCodes.internalServerError) {
    request.logger.error(response?.stack)
  }

  // The browser calls /api/* with fetch and parses JSON; an HTML error page
  // there surfaces as "malformed response" and hides the real status.
  if (request.path.startsWith('/api/')) {
    return h.response(response.output.payload).code(statusCode)
  }

  return h
    .view('error/index', { statusCode, ...errorPageFor(statusCode) })
    .code(statusCode)
}
