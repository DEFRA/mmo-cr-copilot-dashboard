import { useCallback } from 'react'

import { useDeliveryMetrics } from '../hooks/useDeliveryMetrics'
import { useDeliveryTrend } from '../hooks/useDeliveryTrend'
import { useLeverageV2, useProjectMetric } from '../hooks/useProjectMetric'
import { TOP_LEVEL } from './navigation.js'

const DELIVERY_LEVELS = new Set(['delivery', 'ticket', 'overview'])

/** The project metrics the current page needs; others are not fetched. */
export function useProjectData({
  nav,
  slug,
  period,
  trendSprints,
  jira,
  native
}) {
  const overview = nav.level === 'overview'
  const nativeSlug = native && overview ? slug : null
  const leverageWanted = nav.level === 'leverage' || (overview && !native)
  return {
    delivery: useDeliveryMetrics(
      jira && DELIVERY_LEVELS.has(nav.level) ? slug : null,
      period
    ),
    deliveryTrend: useDeliveryTrend(
      jira && nav.level === 'delivery' ? slug : null,
      trendSprints
    ),
    nativeLeverage: useProjectMetric(nativeSlug, 'ai-native-leverage', period),
    nativeChurn: useProjectMetric(nativeSlug, 'churn', period),
    leverage: useLeverageV2(leverageWanted ? slug : null, period)
  }
}

/** Stable callbacks that open each kind of page. */
export function useOpeners(navigate) {
  const go = navigate
  return {
    openRepo: useCallback(
      (repository) => go({ level: 'repo', repository }),
      [go]
    ),
    openRepoCycle: useCallback(
      (repository) => go({ level: 'repoCycle', repository }),
      [go]
    ),
    openPR: useCallback(
      (repository, prNumber) => go({ level: 'pr', repository, prNumber }),
      [go]
    ),
    openContributor: useCallback(
      (contributor, repository) =>
        go(
          typeof repository === 'string'
            ? { level: 'contributor', contributor, repository }
            : { level: 'contributor', contributor }
        ),
      [go]
    ),
    openTopLevel: useCallback(
      (id) => go(TOP_LEVEL[id] ?? TOP_LEVEL.overview),
      [go]
    ),
    openTicket: useCallback((ticket) => go({ level: 'ticket', ticket }), [go]),
    openLeverage: useCallback(() => go({ level: 'leverage' }), [go]),
    goHome: useCallback(() => go({ level: 'overview' }), [go]),
    openOnboarding: useCallback(() => go({ level: 'onboarding' }), [go])
  }
}
