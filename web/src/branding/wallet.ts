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
import type { PlanRecord } from '@/features/subscriptions/types'
import type {
  PaymentMethod,
  PresetAmount,
  TopupInfo,
} from '@/features/wallet/types'

/**
 * Payment methods whose min_topup is set >= $1,000 USD (e.g. Alipay min_topup=4999 -> ¥36,492.7)
 * are treated as soft-disabled for standard personal plans and default top-up presets.
 */
export const SOFT_DISABLED_METHOD_MIN_USD = 1000

const NON_EPAY_METHOD_TYPES = new Set([
  'stripe',
  'creem',
  'waffo',
  'waffo_pancake',
])

/**
 * Filter Epay methods suitable for direct subscription checkout:
 * excludes non-Epay gateways and soft-disabled methods (min_topup >= $1,000 USD),
 * while keeping normal methods (e.g. wxpay with wallet min_topup=10) available for Starter ¥19.9.
 */
export function filterSubscriptionEpayMethods(
  methods: PaymentMethod[] = []
): PaymentMethod[] {
  return methods.filter((m) => {
    if (!m?.type || NON_EPAY_METHOD_TYPES.has(m.type)) return false
    const min = Number(m.min_topup || 0)
    if (Number.isFinite(min) && min >= SOFT_DISABLED_METHOD_MIN_USD) {
      return false
    }
    return true
  })
}

/**
 * Hide soft-disabled top-up methods (e.g. Alipay min_topup=4999) when they are far above
 * both the current amount and highest preset, so users never see broken-looking disabled buttons.
 * If the user enters a custom amount >= that threshold, the method reappears automatically.
 */
export function filterVisibleTopupMethods(
  methods: PaymentMethod[] = [],
  currentAmount: number,
  maxPresetAmount: number
): PaymentMethod[] {
  const reach = Math.max(currentAmount || 0, maxPresetAmount || 0)
  const visible = methods.filter((m) => {
    const min = Number(m.min_topup || 0)
    if (
      Number.isFinite(min) &&
      min >= SOFT_DISABLED_METHOD_MIN_USD &&
      min > reach
    ) {
      return false
    }
    return true
  })
  return visible.length > 0 ? visible : methods
}

/**
 * Split a plan title like "Starter · 体验版" into primary tier name and localized tag.
 */
export function splitPlanTitle(title: string): {
  primary: string
  secondary: string | null
} {
  const trimmed = title.trim()
  const parts = trimmed.split(/\s*[·|｜]\s*/)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { primary: parts[0], secondary: parts.slice(1).join(' · ') }
  }
  return { primary: trimmed, secondary: null }
}

/**
 * Split a plan subtitle like "个人快速验证｜常规对话约合 3,000 轮 DeepSeek Flash 或 700 轮 GLM-5.3"
 * into audience role + model usage estimate for clean multi-line card typography.
 */
export function splitPlanSubtitle(subtitle?: string): {
  role: string | null
  usage: string | null
} {
  const trimmed = (subtitle || '').trim()
  if (!trimmed) return { role: null, usage: null }
  const parts = trimmed.split(/\s*[｜|]\s*/)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { role: parts[0], usage: parts.slice(1).join(' · ') }
  }
  return { role: trimmed, usage: null }
}

/**
 * Default fixed top-up tiers in backend quota units (USD).
 * All multiples of 10 yield exact integer CNY amounts at the 7.30 fixed rate
 * (¥73, ¥146, ¥365, ¥730, ¥1,460, ¥3,650) and satisfy WeChat min_topup=10.
 */
const DEFAULT_TOPUP_PRESETS: readonly number[] = [10, 20, 50, 100, 200, 500]

const PRESET_TAG_MAP: Record<number, { label: string; highlight?: boolean }> = {
  10: { label: '体验' },
  20: { label: '调试' },
  50: { label: '日常' },
  100: { label: '常用', highlight: true },
  200: { label: '团队' },
  500: { label: '企业' },
}

export function getBrandPresetMeta(
  usdAmount: number
): { label: string; highlight?: boolean } | null {
  return PRESET_TAG_MAP[usdAmount] ?? null
}

/**
 * Resolve fixed top-up presets when backend `amount_options` is empty,
 * keeping every option >= minTopup and preserving configured discounts.
 */
export function buildBrandDefaultPresets(
  minTopup: number,
  discounts: Record<number, number> = {}
): PresetAmount[] {
  const floor = Math.max(1, Number.isFinite(minTopup) ? minTopup : 1)
  const filtered = DEFAULT_TOPUP_PRESETS.filter((v) => v >= floor)
  const values =
    filtered.length > 0
      ? filtered
      : [floor, floor * 2, floor * 5, floor * 10, floor * 20, floor * 50]

  return values.map((value) => ({
    value,
    discount: discounts[value] || 1.0,
  }))
}

/**
 * Pick the initial selected top-up amount so at least one payment method is
 * immediately usable on page load (avoiding all-disabled payment buttons).
 */
export function pickInitialTopupAmount(
  topupInfo: TopupInfo | null,
  presets: PresetAmount[],
  minTopup: number
): { amount: number; presetValue: number | null } {
  const methods = topupInfo?.pay_methods ?? []
  const effectiveMins = methods.map((m) => {
    const methodMin = Number(m.min_topup || 0)
    return Math.max(
      Number.isFinite(methodMin) && methodMin > 0 ? methodMin : 0,
      minTopup
    )
  })
  const lowestUsableMin =
    effectiveMins.length > 0 ? Math.min(...effectiveMins) : minTopup

  const matched = presets.find((p) => p.value >= lowestUsableMin)
  if (matched) {
    return { amount: matched.value, presetValue: matched.value }
  }
  if (presets.length > 0) {
    return { amount: presets[0].value, presetValue: presets[0].value }
  }
  return { amount: lowestUsableMin, presetValue: null }
}

/**
 * Sort subscription plans ascending by price (entry -> mid -> enterprise)
 * for natural SaaS tier readability.
 */
export function sortSubscriptionPlansAscending(
  plans: PlanRecord[]
): PlanRecord[] {
  return [...plans].sort((a, b) => {
    const priceA = Number(a?.plan?.price_amount ?? 0)
    const priceB = Number(b?.plan?.price_amount ?? 0)
    if (priceA !== priceB) return priceA - priceB
    return Number(a?.plan?.id ?? 0) - Number(b?.plan?.id ?? 0)
  })
}

/**
 * Compute conservative integer bonus percentage (floored to 5% increments >= 10%)
 * from a plan's granted quota vs its USD price, so displayed bonus never overstates reality.
 */
export function computePlanBonusPercent(
  priceAmountUsd: number,
  totalAmountQuota: number,
  quotaPerUnit: number = 500000
): number | null {
  if (
    !Number.isFinite(priceAmountUsd) ||
    !Number.isFinite(totalAmountQuota) ||
    !Number.isFinite(quotaPerUnit) ||
    priceAmountUsd <= 0 ||
    totalAmountQuota <= 0 ||
    quotaPerUnit <= 0
  ) {
    return null
  }
  const grantedUsd = totalAmountQuota / quotaPerUnit
  const rawPercent = ((grantedUsd - priceAmountUsd) / priceAmountUsd) * 100
  if (rawPercent < 5) return null
  if (rawPercent < 10) return Math.floor(rawPercent)
  return Math.floor(rawPercent / 5) * 5
}

/**
 * Highlight the flagship Pro tier (index 2 in 4-tier Starter/Plus/Pro/Max,
 * index 1 in 3-tier layouts).
 */
export function getRecommendedSubscriptionIndex(planCount: number): number {
  if (planCount >= 4) return 2
  if (planCount === 3) return 1
  return 0
}
