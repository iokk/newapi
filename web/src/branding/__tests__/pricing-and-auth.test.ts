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
import type { TFunction } from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  filterVisibleGroups,
  formatBrandUsdPrice,
  hasVisibleBrandTelemetry,
  parseImageFloorBillingExpr,
} from '@/branding/pricing-telemetry'
import { loginMethodLabel } from '@/features/security/components/login-session-utils'
import { resolveLegacyRoute } from '@/lib/legacy-route'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

describe('brand pricing & auth helpers', () => {
  beforeEach(() => {
    useSystemConfigStore.setState((state) => ({
      config: {
        ...state.config,
        currency: {
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: 'CNY',
          usdExchangeRate: 7,
        },
      },
    }))
  })

  it('parses Bozzii image floor billing expressions into USD rates', () => {
    const expr10 =
      'tier("standard", max(p * 5 + cr * 1.25 + img * 8 + img_cr * 2 + c * 30, 100000 * (image_count > 0 ? image_count : (c > 0 ? 1 : 0))))'
    expect(parseImageFloorBillingExpr(expr10)).toEqual({
      minPerImageUsd: 0.1,
      inputPerMUsd: 5,
      cacheReadPerMUsd: 1.25,
      imageInputPerMUsd: 8,
      outputPerMUsd: 30,
    })

    const expr04 =
      'tier("standard", max(p * 2.5 + cr * 0.625 + c * 15, 40000 * (image_count > 0 ? image_count : (c > 0 ? 1 : 0))))'
    expect(parseImageFloorBillingExpr(expr04)?.minPerImageUsd).toBe(0.04)

    expect(
      parseImageFloorBillingExpr('tier("standard", p * 3 + c * 15)')
    ).toBeNull()
    expect(parseImageFloorBillingExpr(undefined)).toBeNull()
  })

  it('formats image-floor prices accurately in standard and recharge modes without double-multiplying exchange rate', () => {
    // $0.10 * 7 CNY/USD = ¥0.7000
    expect(
      formatBrandUsdPrice(0.1, {
        usdExchangeRate: 7,
        showCurrencySymbol: true,
      })
    ).toContain('0.7')

    // showCurrencySymbol: false omits currency symbol
    expect(
      formatBrandUsdPrice(0.1, {
        usdExchangeRate: 7,
        showCurrencySymbol: false,
      })
    ).not.toMatch(/[¥$]/)

    // Recharge price: $0.10 at priceRate=5 CNY/USD -> ¥0.50 (NOT ¥3.50!)
    const recharge = formatBrandUsdPrice(0.1, {
      showRechargePrice: true,
      priceRate: 5,
      usdExchangeRate: 7,
      showCurrencySymbol: false,
    })
    expect(Number.parseFloat(recharge)).toBeCloseTo(0.5, 4)
  })

  it('filters out internal private groups not present in usableGroup', () => {
    const raw = [
      'auto',
      'default',
      '标准定价',
      '鹅组开发',
      '鹅组测试',
      'XSEEK官方',
    ]
    const usable = {
      default: { desc: '默认分组', ratio: 1 },
      标准定价: { desc: '标准定价', ratio: 1 },
    }
    expect(filterVisibleGroups(raw, usable)).toEqual(['default', '标准定价'])
    expect(filterVisibleGroups(['auto', 'default', 'vip'])).toEqual([
      'default',
      'vip',
    ])
  })

  it('detects when model telemetry has displayable metrics', () => {
    expect(hasVisibleBrandTelemetry(null)).toBe(false)
    expect(hasVisibleBrandTelemetry({ model: 'm', ok_requests: 0 })).toBe(false)
    expect(
      hasVisibleBrandTelemetry({ model: 'm', cache_hit_rate_pct: 71.7 })
    ).toBe(true)
    expect(
      hasVisibleBrandTelemetry({
        model: 'm',
        canary: { passed: true, integrity_ratio: 1 },
      })
    ).toBe(true)
  })

  it('resolves legacy top-level bookmark routes to current console paths', () => {
    expect(resolveLegacyRoute('/token')).toBe('/keys')
    expect(resolveLegacyRoute('/token?tab=1')).toBe('/keys?tab=1')
    expect(resolveLegacyRoute('/log')).toBe('/usage-logs/common')
    expect(resolveLegacyRoute('/topup')).toBe('/wallet')
    expect(resolveLegacyRoute('/login?redirect=%2Fkeys')).toBe(
      '/sign-in?redirect=%2Fkeys'
    )
  })

  it('uses custom oidc display name in login session method labels', () => {
    const t = ((key: string) => key) as unknown as TFunction
    expect(loginMethodLabel('oauth:oidc', t, '铂子统一账号')).toBe(
      'OAuth · 铂子统一账号'
    )
    expect(loginMethodLabel('oauth:oidc', t, '')).toBe('OAuth · OIDC')
    expect(loginMethodLabel('oauth:oidc', t)).toBe('OAuth · OIDC')
  })
})
