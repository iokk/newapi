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
import type { PresetAmount, TopupInfo } from '@/features/wallet/types'

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
  const methodMins = (topupInfo?.pay_methods ?? [])
    .map((m) => Number(m.min_topup || 0))
    .filter((n) => Number.isFinite(n) && n > 0)
  const lowestUsableMin =
    methodMins.length > 0 ? Math.max(minTopup, Math.min(...methodMins)) : minTopup

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
