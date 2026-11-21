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
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  Headset,
  Wrench,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import type { LogOtherData } from '@/features/usage-logs/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

import {
  buildSanitizedDiagnosticReport,
  diagnoseLogError,
  isErrorUsageLog,
} from './log-diagnostics'

interface LogErrorDiagnosticCardProps {
  log: UsageLog
  other: LogOtherData | null
}

/**
 * Rendered inside Usage Log DetailsDialog for failed / interrupted requests:
 * provides plain-language root-cause hints, self-fix steps, and 1-click sanitized copy.
 */
export function LogErrorDiagnosticCard({
  log,
  other,
}: LogErrorDiagnosticCardProps) {
  const { t } = useTranslation()
  const router = useRouter({ warn: false })
  const { copiedText, copyToClipboard } = useCopyToClipboard({
    notify: true,
    successMessage: t('Copied sanitized diagnostic report'),
    resetAfterMs: 2000,
  })

  if (!isErrorUsageLog(log, other)) return null

  const diagnosis = diagnoseLogError(log, other)
  const copied = copiedText !== null

  const handleCopyReport = () => {
    void copyToClipboard(buildSanitizedDiagnosticReport(log, other))
  }

  const handleContactClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!router) return
    event.preventDefault()
    void router.navigate({ to: '/contact' })
  }

  return (
    <div
      data-slot='log-error-diagnostic'
      className='bg-muted/35 space-y-3 rounded-lg border p-3.5 text-xs'
    >
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Wrench
            className='text-muted-foreground size-3.5 shrink-0'
            aria-hidden='true'
          />
          <span className='text-foreground font-semibold'>
            {diagnosis.title}
          </span>
        </div>
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 text-[11px] font-medium',
            diagnosis.retryable
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-border bg-background text-muted-foreground'
          )}
        >
          {diagnosis.retryable ? '可退避重试' : '需修正配置'}
        </span>
      </div>

      <p className='text-muted-foreground leading-relaxed'>{diagnosis.cause}</p>

      <ul className='text-foreground/90 list-disc space-y-1 pl-4 leading-relaxed'>
        {diagnosis.fixSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>

      <div className='flex flex-wrap items-center gap-2 border-t pt-2.5'>
        <Button
          type='button'
          size='sm'
          variant='default'
          className='h-7 gap-1.5 px-2.5 text-xs'
          onClick={handleCopyReport}
        >
          {copied ? (
            <Check className='size-3.5' aria-hidden='true' />
          ) : (
            <ClipboardCopy className='size-3.5' aria-hidden='true' />
          )}
          {copied ? t('Copied') : t('Copy Diagnostic Report')}
        </Button>

        <a
          href='/contact'
          onClick={handleContactClick}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'h-7 gap-1.5 px-2.5 text-xs'
          )}
        >
          <Headset className='size-3.5' aria-hidden='true' />
          {t('Contact Support')}
        </a>

        <a
          href={diagnosis.docHref}
          target='_blank'
          rel='noopener noreferrer'
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'text-muted-foreground h-7 gap-1 px-2 text-xs'
          )}
        >
          {t('Troubleshooting Docs')}
          <ExternalLink className='size-3' aria-hidden='true' />
        </a>
      </div>
    </div>
  )
}

/**
 * Compact 1-click diagnostic copy icon rendered inline on failed log rows.
 */
export function LogErrorQuickCopyButton({
  log,
  other,
}: LogErrorDiagnosticCardProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({
    notify: true,
    successMessage: t('Copied sanitized diagnostic report'),
    resetAfterMs: 1800,
  })

  if (!isErrorUsageLog(log, other)) return null

  const copied = copiedText !== null

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    void copyToClipboard(buildSanitizedDiagnosticReport(log, other))
  }

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      data-slot='log-error-quick-copy'
      className='text-muted-foreground hover:text-foreground size-6 shrink-0'
      onClick={handleClick}
      title={t('Copy sanitized diagnostic report')}
      aria-label={t('Copy sanitized diagnostic report')}
    >
      {copied ? (
        <Check
          className='size-3.5 text-green-600 dark:text-green-400'
          aria-hidden='true'
        />
      ) : (
        <ClipboardCopy className='size-3.5' aria-hidden='true' />
      )}
    </Button>
  )
}
