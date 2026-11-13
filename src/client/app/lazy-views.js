import { lazy } from 'react'

const named = (load, name) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

export const OverviewView = named(
  () => import('../components/views/OverviewView'),
  'OverviewView'
)
export const RepoView = named(
  () => import('../components/views/RepoView'),
  'RepoView'
)
export const DeliveryView = named(
  () => import('../components/views/DeliveryView'),
  'DeliveryView'
)
export const TicketView = named(
  () => import('../components/views/DeliveryView'),
  'TicketView'
)
export const LeverageView = named(
  () => import('../components/views/LeverageView'),
  'LeverageView'
)
export const AiNativeOverviewView = named(
  () => import('../components/views/AiNativeOverviewView'),
  'AiNativeOverviewView'
)
export const PRView = named(
  () => import('../components/views/PRView'),
  'PRView'
)
export const ContributorView = named(
  () => import('../components/views/ContributorView'),
  'ContributorView'
)
export const RepoCycleTimeView = named(
  () => import('../components/views/RepoCycleTimeView'),
  'RepoCycleTimeView'
)
export const SettingsView = named(
  () => import('../components/views/SettingsView'),
  'SettingsView'
)
export const AccessibilityStatementView = named(
  () => import('../components/views/AccessibilityStatementView'),
  'AccessibilityStatementView'
)
export const UnauthorisedView = named(
  () => import('../components/views/UnauthorisedView'),
  'UnauthorisedView'
)
export const AdminProjectsView = named(
  () => import('../components/views/AdminProjectsView'),
  'AdminProjectsView'
)
export const OnboardingView = named(
  () => import('../components/views/OnboardingView'),
  'OnboardingView'
)
export const HelpView = named(
  () => import('../components/views/HelpView'),
  'HelpView'
)
export const CookiesView = named(
  () => import('../components/views/CookiesView'),
  'CookiesView'
)
export const PrivacyView = named(
  () => import('../components/views/PrivacyView'),
  'PrivacyView'
)
export const CopilotUsageView = named(
  () => import('../components/views/CopilotUsageView'),
  'CopilotUsageView'
)
export const PullRequestsView = named(
  () => import('../components/views/PullRequestsView'),
  'PullRequestsView'
)
export const ContributorsView = named(
  () => import('../components/views/ContributorsView'),
  'ContributorsView'
)
