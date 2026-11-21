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
import { Check, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { dotColorMap } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
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

import { SHOW_PRICING_GROUPS } from './pricing'
import { sortSubscriptionPlansAscending } from './wallet'

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
 * OpenAI-inspired ascending vertical subscription tier list:
 * eliminates the 2+1 orphan card, unifies local currency formatting,
 * and hides internal group identifiers when SHOW_PRICING_GROUPS is false.
 */
export function BrandSubscriptionTierList({
  plans,
  planPurchaseCountMap,
  onSelectPlan,
}: BrandSubscriptionTierListProps) {
  const { t } = useTranslation()
  const sortedPlans = useMemo(
    () => sortSubscriptionPlansAscending(plans),
    [plans]
  )
  const recommendedIndex = sortedPlans.length >= 3 ? 1 : 0

  if (sortedPlans.length === 0) {
    return (
      <p className='text-muted-foreground py-4 text-center text-sm'>
        {t('No plans available')}
      </p>
    )
  }

  return (
    <div className='space-y-3'>
      {sortedPlans.map((p, index) => {
        const plan = p?.plan
        if (!plan) return null
        const totalAmount = Number(plan.total_amount || 0)
        const formattedPrice = formatBillingCurrencyFromUSD(
          Number(plan.price_amount || 0),
          { digitsLarge: 2, abbreviate: false }
        )
        const isPopular = sortedPlans.length > 1 && index === recommendedIndex
        const limit = Number(plan.max_purchase_per_user || 0)
        const count = planPurchaseCountMap.get(plan.id) || 0
        const reached = limit > 0 && count >= limit

        let groupBenefit: string | null = null
        if (plan.upgrade_group) {
          groupBenefit = SHOW_PRICING_GROUPS
            ? `${t('Upgrade Group')}: ${plan.upgrade_group}`
            : t('Enterprise dedicated routing')
        }
        const benefits = [
          `${t('Validity Period')}: ${formatDuration(plan, t)}`,
          formatResetPeriod(plan, t) !== t('No Reset')
            ? `${t('Quota Reset')}: ${formatResetPeriod(plan, t)}`
            : null,
          totalAmount > 0
            ? `${t('Total Quota')}: ${formatQuota(totalAmount)}`
            : `${t('Total Quota')}: ${t('Unlimited')}`,
          limit > 0 ? `${t('Purchase Limit')}: ${limit}` : null,
          groupBenefit,
        ].filter(Boolean) as string[]

        return (
          <div
            key={plan.id}
            className={cn(
              'bg-background rounded-xl border p-4 transition-colors',
              isPopular
                ? 'border-foreground/50 ring-1 ring-foreground/15'
                : 'border-border/80'
            )}
          >
            <div className='flex items-start justify-between gap-4'>
              <div className='min-w-0 space-y-0.5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h4 className='truncate text-sm font-semibold'>
                    {(plan.title || t('Subscription Plans')).trim()}
                  </h4>
                  {isPopular && (
                    <span className='bg-primary/10 text-primary rounded-md px-2 py-0.5 text-[11px] font-medium'>
                      {t('Recommended')}
                    </span>
                  )}
                </div>
                {plan.subtitle && (
                  <p className='text-muted-foreground text-xs'>
                    {plan.subtitle}
                  </p>
                )}
              </div>
              <div className='shrink-0 text-right'>
                <span className='text-foreground font-mono text-xl font-semibold tracking-tight tabular-nums'>
                  {formattedPrice}
                </span>
              </div>
            </div>

            <div className='mt-3 flex flex-wrap gap-x-4 gap-y-1.5'>
              {benefits.map((label) => (
                <div
                  key={label}
                  className='text-muted-foreground flex items-center gap-1.5 text-xs'
                >
                  <Check
                    className='text-foreground/70 size-3.5 shrink-0'
                    aria-hidden='true'
                  />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div className='mt-3.5'>
              {reached ? (
                <Tooltip>
                  <TooltipTrigger render={<div />}>
                    <Button
                      variant='outline'
                      size='sm'
                      className='w-full'
                      disabled
                    >
                      {t('Limit Reached')}
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
                  className='w-full'
                  onClick={() => onSelectPlan(p)}
                >
                  {t('Subscribe Now')}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
