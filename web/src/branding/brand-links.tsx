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
import { BookOpen, ExternalLink, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const XSEEK_AGENT_URL = 'https://xseekai.cn/index.html'
export const QUICK_CONNECT_URL = '/brand/connect.html'
export const SUPPORT_EMAIL = 'support@bozzii.com'
export const FEISHU_SUPPORT_URL =
  'https://www.feishu.cn/invitation/page/add_contact/?token=53cgddeb-cca0-44ce-bf47-01b22d096bd1&unique_id=zjiyrPYNA0hoEh1gNlp4Lg=='

export function XseekAgentLink() {
  const { t } = useTranslation()
  return (
    <a
      href={XSEEK_AGENT_URL}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={t('XSEEK Agent')}
      title={t('XSEEK Agent')}
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'h-8 gap-1.5 px-2.5 text-xs'
      )}
    >
      <Sparkles className='size-3.5 shrink-0' />
      <span className='hidden sm:inline lg:hidden xl:inline'>
        {t('XSEEK Agent')}
      </span>
    </a>
  )
}

export function ClientConfigGuideCard() {
  const { t } = useTranslation()
  return (
    <Card className='mt-6'>
      <CardHeader>
        <CardTitle>{t('Client Setup Guide & XSEEK Agent')}</CardTitle>
        <CardDescription>
          {t(
            'Use the tabs above for one-click setup, or open the public Quick Connect Hub for manual client and SDK guides.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <ol className='text-muted-foreground list-decimal space-y-1.5 ps-5 text-sm'>
          <li>
            {t(
              'Choose an existing API key above, or keep Automatic per-client key for isolated, revocable access.'
            )}
          </li>
          <li>
            {t(
              'Pick WorkBuddy, DSH, Claude Code, or Codex to generate a one-time setup prompt, install command, or CC Switch import without exposing raw secrets.'
            )}
          </li>
          <li>
            {t(
              'For CodeBuddy, Cherry Studio, Cursor, or custom SDKs, use https://api.bozzii.com/v1 (OpenAI/Gemini) or https://api.bozzii.com (Anthropic native).'
            )}
          </li>
        </ol>
        <div className='flex flex-wrap gap-2'>
          <a
            href={QUICK_CONNECT_URL}
            target='_blank'
            rel='noopener noreferrer'
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <BookOpen className='size-4' />
            {t('Full Quick Connect Guide')}
            <ExternalLink className='size-3.5 opacity-70' />
          </a>
          <a
            href={XSEEK_AGENT_URL}
            target='_blank'
            rel='noopener noreferrer'
            className={buttonVariants({ variant: 'default', size: 'sm' })}
          >
            <Sparkles className='size-4' />
            {t('Visit XSEEK Agent (Book Demo)')}
            <ExternalLink className='size-3.5 opacity-80' />
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
