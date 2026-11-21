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
import { ArrowUpRight, Building2, RefreshCw, Sparkles } from 'lucide-react'
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
} from './wallet'

interface EmptySubscriptionStatusBarProps {
  refreshing: boolean
  onRefresh: () => void
}

/**
 * Compact 1-line status bar shown when the user has no subscriptions yet,
 * replacing the multi-line disabled preference form.
 */
export function EmptySubscriptionStatusBar({
  refreshing,
  onRefresh,
}: EmptySubscriptionStatusBarProps) {
  const { t } = useTranslation()
  return (
    <div className='bg-muted/30 text-muted-foreground flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs'>
      <span className='flex items-center gap-2'>
        <span
          className={cn('size-1.5 shrink-0 rounded-full', dotColorMap.neutral)}
          aria-hidden='true'
        />
        <span>
          {t('My Subscriptions')}: {t('No Active')}
        </span>
      </span>
      <span className='flex items-center gap-2'>
        <span>{t('Using wallet balance by default')}</span>
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
      </span>
    </div>
  )
}

interface BrandSubscriptionTierListProps {
  plans: PlanRecord[]
  planPurchaseCountMap: Map<number, number>
  onSelectPlan: (plan: PlanRecord) => void
}

/**
 * Redesigned Subscription Store for individual developer 30-day experience tiers:
 * - Explicit scope banner separating personal shared routes from enterprise high-SLA lines
 * - Compact horizontal tier cards with integer bonus pills (+30% / +20% / +30% / +40%)
 * - Clear granted quota + domestic model turn reference + purchase cap status
 * - Dedicated Enterprise High-SLA footer bar linking to /contact
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
      <p className='text-muted-foreground py-4 text-center text-sm'>
        {t('No plans available')}
      </p>
    )
  }

  return (
    <div className='space-y-3'>
      {/* Scope positioning banner */}
      <div className='bg-muted/25 rounded-lg border px-3 py-2 text-xs leading-relaxed'>
        <div className='text-foreground font-medium'>
          个人开发者专属体验与开发套餐 · 统一 30 天有效 · 超额自动无缝衔接钱包余额
        </div>
        <div className='text-muted-foreground mt-0.5'>
          标准共享路由（不含企业 SLA）；企业高并发、对公开票与高 SLA 纯净专线请通过下方企业入口采购。
        </div>
      </div>

      {/* Compact horizontal tier cards */}
      <div className='space-y-2.5'>
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

          const durationLabel = formatDuration(plan, t)
          const resetLabel = formatResetPeriod(plan, t)
          const metaParts: string[] = [durationLabel]
          if (resetLabel !== t('No Reset')) {
            metaParts.push(`${t('Quota Reset')}: ${resetLabel}`)
          }
          if (limit > 0) {
            metaParts.push(`限购 ${limit} 次`)
          }
          if (plan.upgrade_group && SHOW_PRICING_GROUPS) {
            metaParts.push(`${t('Upgrade Group')}: ${plan.upgrade_group}`)
          } else {
            metaParts.push('个人共享通道')
          }

          let bonusBadge = null
          if (isFirstOrderPromo) {
            bonusBadge = (
              <span className='inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300'>
                <Sparkles className='size-3' aria-hidden='true' />
                首单加赠 {bonusPct}%
              </span>
            )
          } else if (bonusPct) {
            bonusBadge = (
              <span className='rounded-md bg-green-500/12 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400'>
                加赠 {bonusPct}%
              </span>
            )
          }

          return (
            <div
              key={plan.id}
              data-slot='subscription-store-card'
              className={cn(
                'bg-background rounded-xl border p-3.5 transition-colors',
                isPopular
                  ? 'border-foreground/55 ring-1 ring-foreground/15'
                  : 'border-border/80 hover:border-foreground/30'
              )}
            >
              {/* Row 1: Title + Badges | Price */}
              <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
                <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
                  <h4 className='truncate text-sm font-semibold'>
                    {(plan.title || t('Subscription Plans')).trim()}
                  </h4>
                  {bonusBadge}
                  {isPopular && (
                    <span className='bg-primary/10 text-primary rounded-md px-1.5 py-0.5 text-[11px] font-medium'>
                      {t('Recommended')}
                    </span>
                  )}
                </div>
                <div className='flex shrink-0 items-baseline gap-1'>
                  <span className='text-foreground font-mono text-lg font-semibold tracking-tight tabular-nums'>
                    {formattedPrice}
                  </span>
                  <span className='text-muted-foreground text-[11px]'>
                    / {durationLabel}
                  </span>
                </div>
              </div>

              {/* Row 2: Granted Quota + Subtitle | Action Button */}
              <div className='mt-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between'>
                <div className='min-w-0 space-y-0.5'>
                  <div className='flex flex-wrap items-baseline gap-1.5 text-xs'>
                    <span className='text-muted-foreground'>到账额度</span>
                    <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
                      {formattedQuota}
                    </span>
                  </div>
                  {plan.subtitle && (
                    <p className='text-muted-foreground text-xs leading-snug'>
                      {plan.subtitle}
                    </p>
                  )}
                </div>

                <div className='shrink-0'>
                  {reached ? (
                    <Tooltip>
                      <TooltipTrigger render={<div />}>
                        <Button
                          variant='outline'
                          size='sm'
                          className='h-8 w-full px-3 text-xs sm:w-auto'
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
                      className='h-8 w-full px-3.5 text-xs sm:w-auto'
                      onClick={() => onSelectPlan(p)}
                    >
                      {t('Subscribe Now')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Row 3: Concise micro-meta */}
              <div className='text-muted-foreground/85 mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t pt-2 text-[11px]'>
                {metaParts.map((item, idx) => (
                  <span key={item} className='inline-flex items-center gap-2'>
                    {idx > 0 && <span aria-hidden='true'>·</span>}
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dedicated Enterprise High-SLA Bar */}
      <div className='bg-muted/30 flex flex-col justify-between gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center'>
        <div className='min-w-0 space-y-0.5'>
          <div className='flex items-center gap-1.5 text-xs font-semibold'>
            <Building2
              className='text-muted-foreground size-3.5 shrink-0'
              aria-hidden='true'
            />
            <span>Enterprise · 企业开发者与高 SLA 专线</span>
          </div>
          <p className='text-muted-foreground text-[11px] leading-relaxed'>
            独立纯净官转高可用通道 · 无个人限购约束 · 1 年有效期 · 支持对公付款与增值税专票
          </p>
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
