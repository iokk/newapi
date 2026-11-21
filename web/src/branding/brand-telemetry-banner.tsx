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
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  hasVisibleBrandTelemetry,
  useBrandTelemetry,
} from './pricing-telemetry'

export function BrandTelemetryBanner(props: { modelName: string }) {
  const { t } = useTranslation()
  const { data } = useBrandTelemetry()
  const telemetry = data?.models?.[props.modelName]
  if (!telemetry || !hasVisibleBrandTelemetry(telemetry)) return null

  const canary = telemetry.canary
  const canaryPassed = canary?.passed === true
  const showCanary =
    canary != null && (canary.passed != null || canary.integrity_ratio != null)
  let canaryLabel = t('Probe warning')
  if (canary?.integrity_ratio != null) {
    canaryLabel = `${canary.integrity_ratio.toFixed(2)}x`
  } else if (canaryPassed) {
    canaryLabel = '1.00x'
  }

  return (
    <div className='border-border/70 bg-muted/30 flex flex-col gap-3 rounded-lg border p-3.5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-1.5 text-sm font-semibold'>
          <ShieldCheck className='size-4 text-emerald-600 dark:text-emerald-400' />
          <span>{t('7-Day Real Production Telemetry')}</span>
        </div>
        <a
          href={data?.status_page || 'https://status.bozzii.com/'}
          target='_blank'
          rel='noopener noreferrer'
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline'
        >
          <span>{t('Live Status Page')}</span>
          <ExternalLink className='size-3' />
        </a>
      </div>

      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
        {telemetry.cache_hit_rate_pct != null && (
          <div className='bg-background rounded-md border px-2.5 py-2'>
            <div className='text-muted-foreground text-[11px]'>
              {t('7d Real Cache Hit')}
            </div>
            <div className='font-mono text-base font-semibold text-emerald-600 tabular-nums dark:text-emerald-400'>
              {telemetry.cache_hit_rate_pct.toFixed(1)}%
            </div>
          </div>
        )}
        {telemetry.success_rate_pct != null && (
          <div className='bg-background rounded-md border px-2.5 py-2'>
            <div className='text-muted-foreground text-[11px]'>
              {t('7d Success Rate')}
            </div>
            <div className='font-mono text-base font-semibold tabular-nums'>
              {telemetry.success_rate_pct.toFixed(2)}%
            </div>
          </div>
        )}
        {telemetry.p50_latency_s != null && (
          <div className='bg-background rounded-md border px-2.5 py-2'>
            <div className='text-muted-foreground text-[11px]'>
              {t('7d P50 Latency')}
            </div>
            <div className='font-mono text-base font-semibold tabular-nums'>
              {telemetry.p50_latency_s.toFixed(1)}s
            </div>
          </div>
        )}
        {showCanary && (
          <div className='bg-background rounded-md border px-2.5 py-2'>
            <div className='text-muted-foreground text-[11px]'>
              {t('Billing Integrity Probe')}
            </div>
            <div
              className={
                canaryPassed
                  ? 'inline-flex items-center gap-1 font-mono text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400'
                  : 'inline-flex items-center gap-1 font-mono text-sm font-semibold text-amber-600 tabular-nums dark:text-amber-400'
              }
            >
              {canaryPassed ? (
                <CheckCircle2 className='size-3.5 shrink-0' />
              ) : (
                <AlertTriangle className='size-3.5 shrink-0' />
              )}
              <span>{canaryLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
