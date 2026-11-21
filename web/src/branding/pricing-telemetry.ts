/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useSyncExternalStore } from 'react'

import { EXCLUDED_GROUPS } from '@/features/pricing/constants'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

export type BrandCanaryTelemetry = {
  checked_at?: string | null
  passed?: boolean
  cache_hit_pct?: number | null
  integrity_ratio?: number | null
  latency_ms_warm?: number | null
}

export type BrandModelTelemetry = {
  model: string
  window?: string
  ok_requests?: number
  success_rate_pct?: number | null
  p50_latency_s?: number | null
  cache_hit_rate_pct?: number | null
  canary?: BrandCanaryTelemetry
}

export type BrandTelemetryPayload = {
  generated_at?: string
  window_days?: number
  status_page?: string
  integrity?: {
    checked_at?: string
    passed?: boolean
    probed_count?: number
    max_ratio?: number
  }
  models?: Record<string, BrandModelTelemetry>
}

const TELEMETRY_TTL_MS = 5 * 60 * 1000
let telemetrySnapshot: BrandTelemetryPayload | null = null
let telemetryFetchedAt = 0
let telemetryInFlight: Promise<void> | null = null
const telemetryListeners = new Set<() => void>()

function subscribeTelemetry(listener: () => void) {
  telemetryListeners.add(listener)
  return () => {
    telemetryListeners.delete(listener)
  }
}

function getTelemetrySnapshot() {
  return telemetrySnapshot
}

function loadBrandTelemetry() {
  if (typeof fetch !== 'function' || typeof window === 'undefined') return
  const now = Date.now()
  if (telemetryInFlight || now - telemetryFetchedAt < TELEMETRY_TTL_MS) return
  telemetryInFlight = (async () => {
    try {
      const res = await fetch('/brand/telemetry.json', {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return
      const payload = (await res.json()) as BrandTelemetryPayload
      if (payload && typeof payload === 'object') {
        telemetrySnapshot = payload
        telemetryFetchedAt = Date.now()
        telemetryListeners.forEach((fn) => fn())
      }
    } catch {
      // Non-critical enhancement; ignore when offline or unavailable.
    } finally {
      telemetryInFlight = null
    }
  })()
}

export function hasVisibleBrandTelemetry(
  telemetry: BrandModelTelemetry | null | undefined
): boolean {
  if (!telemetry) return false
  const has7dStats =
    (telemetry.ok_requests ?? 0) > 0 || telemetry.cache_hit_rate_pct != null
  const hasCanary = Boolean(
    telemetry.canary &&
    (telemetry.canary.passed != null ||
      telemetry.canary.integrity_ratio != null)
  )
  return has7dStats || hasCanary
}

export function useBrandTelemetry() {
  const data = useSyncExternalStore(
    subscribeTelemetry,
    getTelemetrySnapshot,
    () => null
  )
  useEffect(() => {
    loadBrandTelemetry()
  }, [])
  return { data }
}

export function useModelBrandTelemetry(
  modelName: string | undefined
): BrandModelTelemetry | null {
  const { data } = useBrandTelemetry()
  if (!modelName || !data?.models) return null
  return data.models[modelName] ?? null
}

/**
 * Filter a model's enable_groups against the groups visible to the current visitor.
 * Prevents leaking internal/private groups (e.g. dev/test/internal org groups)
 * on the public pricing page while remaining backwards-compatible when usableGroup
 * is omitted (such as in isolated component tests).
 */
export function filterVisibleGroups(
  enableGroups: string[] | undefined,
  usableGroup?: Record<string, unknown>
): string[] {
  const raw = Array.isArray(enableGroups) ? enableGroups : []
  const cleaned = raw.filter(
    (g): g is string => Boolean(g) && !EXCLUDED_GROUPS.includes(g)
  )
  if (!usableGroup) return cleaned
  const allowedKeys = Object.keys(usableGroup).filter(
    (g) => Boolean(g) && !EXCLUDED_GROUPS.includes(g)
  )
  if (allowedKeys.length === 0) return cleaned
  const allowed = new Set(allowedKeys)
  return cleaned.filter((g) => allowed.has(g))
}

export type ImageFloorPricing = {
  minPerImageUsd: number
  inputPerMUsd?: number
  cacheReadPerMUsd?: number
  imageInputPerMUsd?: number
  outputPerMUsd?: number
}

/**
 * Parse Bozzii's image floor billing expression:
 *   tier("standard", max(p * 5 + cr * 1.25 + img * 8 + img_cr * 2 + c * 30,
 *                        100000 * (image_count > 0 ? image_count : (c > 0 ? 1 : 0))))
 * In tiered_expr units, 1_000_000 equals $1.00 USD.
 */
export function parseImageFloorBillingExpr(
  rawExpr: string | undefined
): ImageFloorPricing | null {
  if (!rawExpr) return null
  const floorMatch = rawExpr.match(
    /max\s*\(([^,]+),\s*(\d+(?:\.\d+)?)\s*\*\s*\(\s*image_count\b/i
  )
  if (!floorMatch) return null
  const tokenPart = floorMatch[1]
  const floorRaw = Number.parseFloat(floorMatch[2])
  if (!Number.isFinite(floorRaw) || floorRaw <= 0) return null

  const readCoeff = (variable: string): number | undefined => {
    const m = tokenPart.match(
      new RegExp(`\\b${variable}\\s*\\*\\s*(\\d+(?:\\.\\d+)?)`)
    )
    if (!m) return undefined
    const v = Number.parseFloat(m[1])
    return Number.isFinite(v) && v > 0 ? v : undefined
  }

  return {
    minPerImageUsd: floorRaw / 1_000_000,
    inputPerMUsd: readCoeff('p'),
    cacheReadPerMUsd: readCoeff('cr'),
    imageInputPerMUsd: readCoeff('img'),
    outputPerMUsd: readCoeff('c'),
  }
}

export function formatBrandUsdPrice(
  usd: number,
  options: {
    showRechargePrice?: boolean
    priceRate?: number
    usdExchangeRate?: number
    groupRatioMultiplier?: number
    showCurrencySymbol?: boolean
  } = {}
): string {
  const multiplier = options.groupRatioMultiplier ?? 1
  const baseUsd = usd * multiplier
  const priceRate = options.priceRate ?? 1
  const exchangeRate =
    options.usdExchangeRate && options.usdExchangeRate > 0
      ? options.usdExchangeRate
      : 1
  // Match dynamic-price.ts: recharge rate is expressed in local currency per USD,
  // so divide by usdExchangeRate before formatBillingCurrencyFromUSD converts back.
  const effectiveUsd = options.showRechargePrice
    ? (baseUsd * priceRate) / exchangeRate
    : baseUsd
  return formatBillingCurrencyFromUSD(effectiveUsd, {
    showSymbol: options.showCurrencySymbol ?? true,
    digitsLarge: 4,
    digitsSmall: 6,
    abbreviate: false,
  })
}
