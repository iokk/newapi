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
import { useRouter } from '@tanstack/react-router'
import { ArrowUpRight, Building2, Check, RefreshCw, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { dotColorMap } from '@/components/status-badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDuration, formatResetPeriod } from '@/features/subscriptions/lib'
import type { PlanRecord } from '@/features/subscriptions/types'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { SHOW_PRICING_GROUPS } from './pricing'
import {
  computePlanBonusPercent,
  getRecommendedSubscriptionIndex,
  sortSubscriptionPlansAscending,
  splitPlanSubtitle,
  splitPlanTitle,
} from './wallet'

interface EmptySubscriptionStatusBarProps {
  refreshing: boolean
  onRefresh: () => void
}

/**
 * Quiet inline status pill placed in the Subscription section header when the user
 * has no subscriptions yet, avoiding nested box-in-box chrome.
 */
export function EmptySubscriptionStatusBar({
  refreshing,
  onRefresh,
}: EmptySubscriptionStatusBarProps) {
  const { t } = useTranslation()
  return (
    <div className='text-muted-foreground inline-flex items-center gap-2 text-xs'>
      <span
        className={cn('size-1.5 shrink-0 rounded-full', dotColorMap.neutral)}
        aria-hidden='true'
      />
      <span>{t('No Active')}</span>
      <span className='text-border' aria-hidden='true'>
        |
      </span>
      <span className='hidden sm:inline'>
        {t('Using wallet balance by default')}
      </span>
      <Button
        variant='ghost'
        size='icon'
        className='h-6 w-6'
        onClick={onRefresh}
        disabled={refreshing}
        aria-label={t('Refresh')}
      >
        <RefreshCw
          className={cn('h-3 w-3', refreshing && 'animate-spin')}
          aria-hidden='true'
        />
      </Button>
    </div>
  )
}

interface BrandSubscriptionTierListProps {
  plans: PlanRecord[]
  planPurchaseCountMap: Map<number, number>
  onSelectPlan: (plan: PlanRecord) => void
}

/**
 * Full-width 4-column SaaS pricing grid for individual developer 30-day plans:
 * - Side-by-side comparison across Starter / Plus / Pro (recommended) / Max
 * - Uniform column height with bottom-aligned CTAs and restrained emphasis on Pro
 * - Quiet dashed-border Enterprise High-SLA strip below linking to /contact
 */
export function BrandSubscriptionTierList({
  plans,
  planPurchaseCountMap,
  onSelectPlan,
}: BrandSubscriptionTierListProps) {
  const { t } = useTranslation()
  const router = useRouter({ warn: false })
  const quotaPerUnit = useSystemConfigStore(
    (state) =>
      state.config.currency?.quotaPerUnit ||
      DEFAULT_CURRENCY_CONFIG.quotaPerUnit
  )
  const sortedPlans = useMemo(
    () => sortSubscriptionPlansAscending(plans),
    [plans]
  )
  const recommendedIndex = getRecommendedSubscriptionIndex(sortedPlans.length)

  const handleEnterpriseContact = (
    event: React.MouseEvent<HTMLAnchorElement>
  ) => {
    if (!router) return
    event.preventDefault()
    void router.navigate({ to: '/contact' })
  }

  if (sortedPlans.length === 0) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        {t('No plans available')}
      </p>
    )
  }

  let gridColsClass = 'grid-cols-1 sm:grid-cols-2'
  if (sortedPlans.length >= 4) {
    gridColsClass = 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
  } else if (sortedPlans.length === 3) {
    gridColsClass = 'grid-cols-1 md:grid-cols-3'
  }

  return (
    <div className='space-y-3.5'>
      <div className={cn('grid gap-3.5', gridColsClass)}>
        {sortedPlans.map((p, index) => {
          const plan = p?.plan
          if (!plan) return null
          const totalAmount = Number(plan.total_amount || 0)
          const priceUsd = Number(plan.price_amount || 0)
          const formattedPrice = formatBillingCurrencyFromUSD(priceUsd, {
            digitsLarge: 2,
            abbreviate: false,
          })
          const formattedQuota =
            totalAmount > 0 ? formatQuota(totalAmount) : t('Unlimited')
          const bonusPct = computePlanBonusPercent(
            priceUsd,
            totalAmount,
            quotaPerUnit
          )
          const isPopular = sortedPlans.length > 1 && index === recommendedIndex
          const limit = Number(plan.max_purchase_per_user || 0)
          const count = planPurchaseCountMap.get(plan.id) || 0
          const reached = limit > 0 && count >= limit
          const isFirstOrderPromo = index === 0 && limit === 1 && bonusPct

          const { primary: titlePrimary, secondary: titleSecondary } =
            splitPlanTitle(plan.title || t('Subscription Plans'))
          const { role: subtitleRole, usage: subtitleUsage } =
            splitPlanSubtitle(plan.subtitle)
          const durationLabel = formatDuration(plan, t)
          const resetLabel = formatResetPeriod(plan, t)

          const footnoteParts: string[] = []
          if (limit > 0) footnoteParts.push(`限购 ${limit} 次`)
          if (resetLabel !== t('No Reset')) {
            footnoteParts.push(`${t('Quota Reset')}: ${resetLabel}`)
          }
          if (plan.upgrade_group && SHOW_PRICING_GROUPS) {
            footnoteParts.push(plan.upgrade_group)
          } else {
            footnoteParts.push('个人共享通道')
          }

          let bonusPill = null
          if (isFirstOrderPromo) {
            bonusPill = (
              <span className='inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300'>
                <Sparkles className='size-3' aria-hidden='true' />
                首单 +{bonusPct}%
              </span>
            )
          } else if (bonusPct) {
            bonusPill = (
              <span className='shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400'>
                加赠 {bonusPct}%
              </span>
            )
          }

          return (
            <div
              key={plan.id}
              data-slot='subscription-store-card'
              className={cn(
                'bg-card relative flex h-full flex-col justify-between rounded-xl border p-5 transition-colors',
                isPopular
                  ? 'border-foreground/75 ring-1 ring-foreground/15 shadow-xs'
                  : 'border-border/80 hover:border-foreground/30'
              )}
            >
              <div>
                {/* Tier Name + Bonus Badge */}
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-1.5'>
                      <h3 className='text-foreground truncate text-base font-semibold tracking-tight'>
                        {titlePrimary}
                      </h3>
                      {isPopular && (
                        <span className='bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium'>
                          {t('Recommended')}
                        </span>
                      )}
                    </div>
                    {titleSecondary && (
                      <p className='text-muted-foreground mt-0.5 text-xs'>
                        {titleSecondary}
                      </p>
                    )}
                  </div>
                  {bonusPill}
                </div>

                {/* Price */}
                <div className='mt-4 flex items-baseline gap-1'>
                  <span className='text-foreground font-mono text-[28px] leading-none font-bold tracking-tight tabular-nums'>
                    {formattedPrice}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    / {durationLabel}
                  </span>
                </div>

                {/* Granted Quota Strip */}
                <div className='bg-muted/45 mt-3.5 flex items-baseline justify-between rounded-lg px-3 py-2 text-xs'>
                  <span className='text-muted-foreground'>到账额度</span>
                  <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
                    {formattedQuota}
                  </span>
                </div>

                {/* Scope & Usage Reference */}
                {(subtitleRole || subtitleUsage) && (
                  <div className='mt-4 space-y-1.5 border-t pt-3.5 text-xs'>
                    {subtitleRole && (
                      <div className='text-foreground flex items-center gap-1.5 font-medium'>
                        <Check
                          className='text-muted-foreground size-3.5 shrink-0'
                          aria-hidden='true'
                        />
                        <span>{subtitleRole}</span>
                      </div>
                    )}
                    {subtitleUsage && (
                      <p className='text-muted-foreground pl-5 leading-relaxed'>
                        {subtitleUsage}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Footer pinned to bottom */}
              <div className='mt-5 space-y-2'>
                {reached ? (
                  <Tooltip>
                    <TooltipTrigger render={<div />}>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-9 w-full text-xs'
                        disabled
                      >
                        已购 ({count}/{limit})
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('Purchase limit reached')} ({count}/{limit})
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant={isPopular ? 'default' : 'outline'}
                    size='sm'
                    className='h-9 w-full text-xs font-medium'
                    onClick={() => onSelectPlan(p)}
                  >
                    {t('Subscribe Now')}
                  </Button>
                )}
                <p className='text-muted-foreground text-center text-[11px]'>
                  {footnoteParts.join(' · ')}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quiet Enterprise High-SLA Strip */}
      <div className='bg-card/50 flex flex-col justify-between gap-3 rounded-xl border border-dashed px-4 py-3 sm:flex-row sm:items-center'>
        <div className='flex min-w-0 items-start gap-2.5 sm:items-center'>
          <Building2
            className='text-muted-foreground mt-0.5 size-4 shrink-0 sm:mt-0'
            aria-hidden='true'
          />
          <div className='min-w-0 text-xs leading-relaxed'>
            <span className='text-foreground font-semibold'>
              Enterprise · 企业开发者与高 SLA 专线
            </span>
            <span className='text-muted-foreground mx-2 hidden sm:inline'>
              |
            </span>
            <span className='text-muted-foreground block sm:inline'>
              独立纯净官转高可用通道 · 无个人限购 · 1 年有效 · 支持对公付款与专票
            </span>
          </div>
        </div>
        <a
          href='/contact'
          onClick={handleEnterpriseContact}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'h-8 shrink-0 gap-1 px-3 text-xs'
          )}
        >
          <span>联系大客户商务</span>
          <ArrowUpRight className='size-3.5' aria-hidden='true' />
        </a>
      </div>
    </div>
  )
}
