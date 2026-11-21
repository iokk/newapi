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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatBrandUsdPrice,
  parseImageFloorBillingExpr,
  parseVideoResolutionBillingExpr,
  useModelBrandTelemetry,
  type BrandModelTelemetry,
} from '@/branding/pricing-telemetry' // CUSTOM(brand)
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
} from '../lib/dynamic-price'
import { isTokenBasedModel } from '../lib/model-helpers'
import { withBasePricing } from '../lib/plugin-pricing'
import { formatPrice, stripTrailingZeros } from '../lib/price'
import type { PricingModel } from '../types'
import type { ModelPriceCellOptions } from './model-price-cell'

// Hide negligible cache-hit noise (<10%) on low-volume or non-cached models.
const MIN_VISIBLE_CACHE_HIT_PCT = 10

function CacheHitBadge(props: { telemetry: BrandModelTelemetry | null }) {
  const { t } = useTranslation()
  const hitRate = props.telemetry?.cache_hit_rate_pct
  if (hitRate == null || hitRate < MIN_VISIBLE_CACHE_HIT_PCT) return null
  const canaryVerified = props.telemetry?.canary?.passed === true
  const ratio = props.telemetry?.canary?.integrity_ratio
  const ratioText = ratio != null ? `${ratio.toFixed(2)}x` : '1.00x'
  const title = canaryVerified
    ? t('7d real cache hit {{rate}}% · Canary verified ({{ratio}}x billing)', {
        rate: hitRate.toFixed(1),
        ratio: ratio != null ? ratio.toFixed(2) : '1.00',
      })
    : t('7d real production cache hit {{rate}}%', {
        rate: hitRate.toFixed(1),
      })
  return (
    <div className='mt-0.5 flex flex-wrap items-center gap-1' title={title}>
      <span className='inline-flex items-center rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-700 tabular-nums dark:text-emerald-400'>
        {t('{{rate}}% 7d hit', { rate: hitRate.toFixed(1) })}
      </span>
      {canaryVerified && (
        <span className='inline-flex items-center rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 tabular-nums dark:text-emerald-300'>
          {ratioText}
        </span>
      )}
    </div>
  )
}

export function CachedPriceCell(props: {
  model: PricingModel
  options: ModelPriceCellOptions
}) {
  const { t } = useTranslation()
  const {
    tokenUnit = DEFAULT_TOKEN_UNIT,
    priceRate = 1,
    usdExchangeRate = 1,
    showRechargePrice = false,
    selectedGroup,
  } = props.options

  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'

  const model = useMemo(() => withBasePricing(props.model), [props.model])
  const telemetry = useModelBrandTelemetry(model.model_name) // CUSTOM(brand)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(model.billing_expr)
  const dynamicSummary = useMemo(
    () =>
      getDynamicPricingSummary(model, {
        now: billingTime === undefined ? undefined : new Date(billingTime),
        tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        groupRatioMultiplier: getDynamicDisplayGroupRatio(model, selectedGroup),
      }),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      model,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      billingTime,
      currency,
    ]
  )

  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      // CUSTOM(brand): render cache read price for image floor formulas
      const imageFloor = parseImageFloorBillingExpr(
        dynamicSummary.rawExpression
      )
      if (imageFloor) {
        if (imageFloor.cacheReadPerMUsd == null) {
          return <span className='text-muted-foreground/30 text-xs'>—</span>
        }
        const unitScale = tokenUnit === 'K' ? 1000 : 1
        const cachePrice = stripTrailingZeros(
          formatBrandUsdPrice(imageFloor.cacheReadPerMUsd / unitScale, {
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            groupRatioMultiplier: getDynamicDisplayGroupRatio(
              model,
              selectedGroup
            ),
            showCurrencySymbol: true,
          })
        )
        return (
          <div className='max-w-full min-w-0'>
            <span className='font-mono text-sm tabular-nums'>{cachePrice}</span>
            <div className='text-muted-foreground/50 text-[10px]'>
              / {tokenUnitLabel}
            </div>
            <CacheHitBadge telemetry={telemetry} />
          </div>
        )
      }
      if (parseVideoResolutionBillingExpr(dynamicSummary.rawExpression)) {
        return <span className='text-muted-foreground/30 text-xs'>—</span>
      }
      return (
        <span className='text-muted-foreground/50 text-xs'>
          {t('Special billing expression')}
        </span>
      )
    }

    const cacheEntries = dynamicSummary.entries.filter(
      (entry) =>
        entry.field === 'cacheReadPrice' || entry.field === 'imageCachePrice'
    )
    if (!cacheEntries.length) {
      return <span className='text-muted-foreground/30 text-xs'>—</span>
    }

    return (
      <div className='max-w-full min-w-0'>
        {cacheEntries.map((entry) => (
          <div
            key={entry.field}
            className='flex flex-wrap items-baseline gap-x-1'
          >
            {(cacheEntries.length > 1 || entry.field === 'imageCachePrice') && (
              <span className='text-muted-foreground text-xs'>
                {entry.field === 'imageCachePrice'
                  ? t('Image Cache')
                  : t('Cache Read')}
              </span>
            )}
            <span className='font-mono text-sm tabular-nums'>
              {stripTrailingZeros(entry.formatted)}
            </span>
          </div>
        ))}
        <div className='text-muted-foreground/50 text-[10px]'>
          / {tokenUnitLabel}
        </div>
        <CacheHitBadge telemetry={telemetry} />
      </div>
    )
  }

  if (isUnconfiguredTaskUsageModel(model)) {
    return <span className='text-muted-foreground/30 text-xs'>—</span>
  }

  const isTokenBased = isTokenBasedModel(model)

  if (!isTokenBased || model.cache_ratio == null) {
    return <span className='text-muted-foreground/30 text-xs'>—</span>
  }

  const cachedPrice = stripTrailingZeros(
    formatPrice(
      model,
      'cache',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup
    )
  )

  return (
    <div className='max-w-full min-w-0'>
      <span className='font-mono text-sm tabular-nums'>{cachedPrice}</span>
      <div className='text-muted-foreground/50 text-[10px]'>
        / {tokenUnitLabel}
      </div>
      <CacheHitBadge telemetry={telemetry} />
    </div>
  )
}
