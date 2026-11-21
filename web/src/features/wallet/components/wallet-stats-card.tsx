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
import type { ReactNode } from 'react' // CUSTOM(brand)
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
  actions?: ReactNode // CUSTOM(brand): optional quick-jump actions on the right of balance strip
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  if (props.loading) {
    // CUSTOM(brand): responsive monochrome stats skeleton without mobile overflow
    return (
      <div className='bg-card grid grid-cols-3 divide-x rounded-xl border'>
        {['balance', 'usage', 'requests'].map((key) => (
          <div key={key} className='min-w-0 px-3 py-3 sm:px-5 sm:py-4'>
            <Skeleton className='h-3.5 w-full max-w-20' />
            <Skeleton className='mt-2 h-7 w-full max-w-28' />
          </div>
        ))}
      </div>
    )
  }

  const stats: {
    label: string
    value: string
  }[] = [
    {
      label: t('Current Balance'),
      value: formatQuota(props.user?.quota ?? 0),
    },
    {
      label: t('Total Usage'),
      value: formatQuota(props.user?.used_quota ?? 0),
    },
    {
      label: t('API Requests'),
      value: (props.user?.request_count ?? 0).toLocaleString(),
    },
  ]

  return (
    // CUSTOM(brand): sleek OpenAI-inspired monochrome KPI strip with optional quick actions
    <div className='bg-card flex flex-col justify-between divide-y rounded-xl border lg:flex-row lg:items-center lg:divide-x lg:divide-y-0'>
      <div className='grid flex-1 grid-cols-3 divide-x'>
        {stats.map((item, index) => (
          <div key={item.label} className='min-w-0 px-3 py-3 sm:px-5 sm:py-4'>
            <div className='text-muted-foreground truncate text-xs font-medium'>
              {item.label}
            </div>
            <div
              className={
                index === 0
                  ? 'text-foreground mt-1 font-mono text-base font-semibold tracking-tight break-all tabular-nums sm:text-2xl'
                  : 'text-foreground/90 mt-1 font-mono text-sm font-semibold tracking-tight break-all tabular-nums sm:text-xl'
              }
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
      {props.actions && (
        <div className='flex shrink-0 flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5 lg:py-0'>
          {props.actions}
        </div>
      )}
    </div>
  )
}
