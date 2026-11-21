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
import { describe, expect, it } from 'vitest'

import type { PlanRecord } from '@/features/subscriptions/types'
import type { TopupInfo } from '@/features/wallet/types'

import {
  buildBrandDefaultPresets,
  computePlanBonusPercent,
  ENABLE_SUBSCRIPTION_EPAY_DIRECT,
  filterSubscriptionEpayMethods,
  filterVisibleTopupMethods,
  getBrandPresetMeta,
  getRecommendedSubscriptionIndex,
  pickInitialTopupAmount,
  sortSubscriptionPlansAscending,
  splitPlanSubtitle,
  splitPlanTitle,
} from '../wallet'

describe('brand wallet helpers', () => {
  it('produces 6 clean integer-CNY presets at 7.3 exchange rate', () => {
    const presets = buildBrandDefaultPresets(1)
    expect(presets.map((p) => p.value)).toEqual([10, 20, 50, 100, 200, 500])
    for (const p of presets) {
      expect(Number.isInteger(p.value * 7.3)).toBe(true)
    }
    expect(getBrandPresetMeta(100)).toEqual({ label: '常用', highlight: true })
  })

  it('picks initial preset >= lowest payment method min_topup so pay button is immediately clickable', () => {
    const presets = buildBrandDefaultPresets(1)
    const info = {
      pay_methods: [
        { name: '支付宝', type: 'alipay', min_topup: 4999 },
        { name: '微信', type: 'wxpay', min_topup: 10 },
      ],
    } as TopupInfo

    expect(pickInitialTopupAmount(info, presets, 1)).toEqual({
      amount: 10,
      presetValue: 10,
    })
  })

  it('sorts subscription plans ascending by price', () => {
    const raw = [
      { plan: { id: 3, title: '旗舰版', price_amount: 6845 } },
      { plan: { id: 2, title: '商业版 ', price_amount: 2740 } },
      { plan: { id: 1, title: '启航版', price_amount: 685 } },
    ] as unknown as PlanRecord[]

    const sorted = sortSubscriptionPlansAscending(raw)
    expect(sorted.map((p) => p.plan.id)).toEqual([1, 2, 3])
  })

  it('computes conservative integer bonus percentages and recommends Pro in 4-tier store', () => {
    expect(computePlanBonusPercent(2.726027, 1780822, 500000)).toBe(30)
    expect(computePlanBonusPercent(13.561644, 8219178, 500000)).toBe(20)
    expect(computePlanBonusPercent(40.958904, 26712329, 500000)).toBe(30)
    expect(computePlanBonusPercent(95.753425, 67123288, 500000)).toBe(40)
    expect(computePlanBonusPercent(10, 5000000, 500000)).toBeNull()
    expect(computePlanBonusPercent(0, 5000000, 500000)).toBeNull()

    expect(getRecommendedSubscriptionIndex(4)).toBe(2)
    expect(getRecommendedSubscriptionIndex(3)).toBe(1)
    expect(getRecommendedSubscriptionIndex(2)).toBe(0)
  })

  it('filters soft-disabled payment methods while keeping usable WeChat Pay for subscriptions and topups', () => {
    expect(ENABLE_SUBSCRIPTION_EPAY_DIRECT).toBe(true)
    const methods = [
      { name: '支付宝', type: 'alipay', min_topup: 4999 },
      { name: '微信', type: 'wxpay', min_topup: 10 },
      { name: 'Stripe', type: 'stripe', min_topup: 5 },
      { name: 'Waffo Pancake', type: 'waffo_pancake', min_topup: 5 },
    ]

    expect(filterSubscriptionEpayMethods(methods).map((m) => m.type)).toEqual([
      'wxpay',
    ])

    // Hides soft-disabled Alipay for normal preset range ($10..$500)
    expect(
      filterVisibleTopupMethods(methods.slice(0, 2), 10, 500).map((m) => m.type)
    ).toEqual(['wxpay'])

    // Automatically reveals Alipay when user enters custom amount >= $4,999
    expect(
      filterVisibleTopupMethods(methods.slice(0, 2), 5000, 500).map(
        (m) => m.type
      )
    ).toEqual(['alipay', 'wxpay'])
  })

  it('splits plan titles and subtitles cleanly for 4-column card typography', () => {
    expect(splitPlanTitle('Starter · 体验版')).toEqual({
      primary: 'Starter',
      secondary: '体验版',
    })
    expect(splitPlanTitle('Pro')).toEqual({
      primary: 'Pro',
      secondary: null,
    })
    expect(
      splitPlanSubtitle(
        '个人快速验证｜常规对话约合 3,000 轮 DeepSeek Flash 或 700 轮 GLM-5.3'
      )
    ).toEqual({
      role: '个人快速验证',
      usage: '常规对话约合 3,000 轮 DeepSeek Flash 或 700 轮 GLM-5.3',
    })
  })
})
