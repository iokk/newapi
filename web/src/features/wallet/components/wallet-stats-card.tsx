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
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  if (props.loading) {
    // CUSTOM(brand): responsive monochrome stats skeleton without mobile overflow
    return (
      <div className='bg-card grid grid-cols-3 divide-x rounded-xl border'>
        {['balance', 'usage', 'requests'].map((key) => (
          <div key={key} className='min-w-0 px-3 py-3 sm:px-6 sm:py-5'>
            <Skeleton className='h-3.5 w-full max-w-20' />
            <Skeleton className='mt-2 h-7 w-full max-w-28 sm:h-8' />
            <Skeleton className='mt-1.5 hidden h-3.5 w-24 md:block' />
          </div>
        ))}
      </div>
    )
  }

  const stats: {
    label: string
    value: string
    description: string
  }[] = [
    {
      label: t('Current Balance'),
      value: formatQuota(props.user?.quota ?? 0),
      description: t('Remaining quota'),
    },
    {
      label: t('Total Usage'),
      value: formatQuota(props.user?.used_quota ?? 0),
      description: t('Total consumed quota'),
    },
    {
      label: t('API Requests'),
      value: (props.user?.request_count ?? 0).toLocaleString(),
      description: t('Total requests made'),
    },
  ]

  return (
    // CUSTOM(brand): OpenAI-inspired clean monochrome stats bar without noisy icon badges
    <div className='bg-card grid grid-cols-3 divide-x rounded-xl border'>
      {stats.map((item, index) => (
        <div key={item.label} className='min-w-0 px-3 py-3 sm:px-6 sm:py-5'>
          <div className='text-muted-foreground truncate text-xs font-medium'>
            {item.label}
          </div>

          <div
            className={
              index === 0
                ? 'text-foreground mt-1.5 font-mono text-sm font-semibold tracking-tight break-all tabular-nums sm:mt-2 sm:text-3xl'
                : 'text-foreground/90 mt-1.5 font-mono text-sm font-semibold tracking-tight break-all tabular-nums sm:mt-2 sm:text-2xl'
            }
          >
            {item.value}
          </div>
          <div className='text-muted-foreground mt-1 hidden text-xs md:block'>
            {item.description}
          </div>
        </div>
      ))}
    </div>
  )
}
