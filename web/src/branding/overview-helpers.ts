/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { QuotaDataItem } from '@/features/dashboard/types'
import type { UserSubscriptionRecord } from '@/features/subscriptions/types'

const PREFERRED_EXAMPLE_MODELS: readonly string[] = [
  'deepseek-v4.1-flash',
  'glm-5.3-flash',
  'glm-5.3',
  'claude-opus-5-5',
  'gpt-5.4',
]

/**
 * Pick a representative flagship Bozzii model for the quickstart curl example
 * instead of blindly using models[0] (which can pick alphabetical niche models like grok-4.6).
 */
export function pickOverviewExampleModel(models?: string[] | null): string {
  if (!Array.isArray(models) || models.length === 0) {
    return PREFERRED_EXAMPLE_MODELS[0]
  }
  const available = new Set(models)
  for (const preferred of PREFERRED_EXAMPLE_MODELS) {
    if (available.has(preferred)) return preferred
  }
  return models[0]
}

export interface ActiveSubscriptionSummary {
  activeCount: number
  totalQuota: number
  usedQuota: number
  remainQuota: number
  usagePercent: number
  hasUnlimited: boolean
  minRemainDays: number | null
}

/**
 * Aggregate currently active, non-expired user subscriptions so the overview
 * reflects subscription credits alongside wallet balance.
 */
export function summarizeActiveSubscriptions(
  subscriptions: UserSubscriptionRecord[] = [],
  nowSec: number = Date.now() / 1000
): ActiveSubscriptionSummary {
  let activeCount = 0
  let totalQuota = 0
  let usedQuota = 0
  let remainQuota = 0
  let hasUnlimited = false
  let minRemainDays: number | null = null

  for (const record of subscriptions) {
    const sub = record?.subscription
    if (!sub || sub.status !== 'active') continue
    const endTime = Number(sub.end_time || 0)
    if (endTime > 0 && endTime < nowSec) continue

    activeCount += 1
    const total = Number(sub.amount_total || 0)
    const used = Math.max(0, Number(sub.amount_used || 0))
    if (total <= 0) {
      hasUnlimited = true
    } else {
      totalQuota += total
      usedQuota += used
      remainQuota += Math.max(0, total - used)
    }

    if (endTime > 0) {
      const days = Math.max(0, Math.ceil((endTime - nowSec) / 86400))
      minRemainDays =
        minRemainDays === null ? days : Math.min(minRemainDays, days)
    }
  }

  const usagePercent =
    totalQuota > 0
      ? Math.min(100, Math.max(0, Math.round((usedQuota / totalQuota) * 100)))
      : 0

  return {
    activeCount,
    totalQuota,
    usedQuota,
    remainQuota,
    usagePercent,
    hasUnlimited,
    minRemainDays,
  }
}

export type AccountHealthState = 'healthy' | 'low' | 'depleted'

/**
 * Compute overall balance health using BOTH wallet balance and active subscription quota,
 * preventing false "Balance depleted" alerts for users running on an active subscription.
 */
export function resolveAccountHealthState(params: {
  walletQuota: number
  activeSubRemainQuota: number
  hasUnlimitedSub: boolean
  recent24hUsage: number
}): AccountHealthState {
  if (params.hasUnlimitedSub) return 'healthy'
  const totalAvailable =
    Math.max(0, params.walletQuota) + Math.max(0, params.activeSubRemainQuota)
  if (totalAvailable <= 0) return 'depleted'
  if (params.recent24hUsage > 0 && totalAvailable / params.recent24hUsage < 3) {
    return 'low'
  }
  return 'healthy'
}

/**
 * Determine whether the user is still in cold-start onboarding (0 API requests AND
 * missing either an API key or any spendable balance/subscription).
 */
export function isColdStartUser(params: {
  keyCount: number
  requestCount: number
  walletQuota: number
  activeSubCount: number
}): boolean {
  if (params.requestCount > 0) return false
  return (
    params.keyCount === 0 ||
    (params.walletQuota <= 0 && params.activeSubCount === 0)
  )
}

export interface DailyTrendPoint {
  dateKey: string
  label: string
  quota: number
  requests: number
}

/**
 * Aggregate QuotaDataItem rows into `days` consecutive local calendar-day buckets
 * ending at `nowSec` for a clean monochrome 7-day trend chart.
 */
export function buildDailyTrendPoints(
  data: QuotaDataItem[] = [],
  days = 7,
  nowSec: number = Date.now() / 1000
): DailyTrendPoint[] {
  const safeDays = Math.max(1, Math.floor(days))
  const today = new Date(nowSec * 1000)
  today.setHours(0, 0, 0, 0)

  const buckets: DailyTrendPoint[] = []
  const byKey = new Map<string, DailyTrendPoint>()

  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - offset)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const dateKey = `${y}-${m}-${day}`
    const point: DailyTrendPoint = {
      dateKey,
      label: `${m}/${day}`,
      quota: 0,
      requests: 0,
    }
    buckets.push(point)
    byKey.set(dateKey, point)
  }

  for (const item of data) {
    const ts = Number(item.created_at)
    if (!Number.isFinite(ts) || ts <= 0) continue
    const d = new Date(ts * 1000)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const target = byKey.get(`${y}-${m}-${day}`)
    if (!target) continue
    target.quota += Math.max(0, Number(item.quota) || 0)
    target.requests += Math.max(0, Number(item.count) || 0)
  }

  return buckets
}

export function normalizeOverviewBaseUrl(sourceUrl?: string): string {
  const trimmed = sourceUrl?.trim()
  if (!trimmed) {
    return typeof window !== 'undefined'
      ? window.location.origin
      : 'https://api.bozzii.com'
  }
  return trimmed
    .replace(/\/+$/, '')
    .replace(/\/v1\/chat\/completions$/, '')
    .replace(/\/v1$/, '')
}

export function buildOverviewCurlSnippet(args: {
  baseUrl: string
  apiKey: string
  model: string
}): string {
  const endpoint = `${normalizeOverviewBaseUrl(args.baseUrl)}/v1/chat/completions`
  return [
    `curl ${endpoint} \\`,
    '  -H "Content-Type: application/json" \\',
    `  -H "Authorization: Bearer ${args.apiKey}" \\`,
    `  -d '{"model":"${args.model}","messages":[{"role":"user","content":"Hello"}]}'`,
  ].join('\n')
}
