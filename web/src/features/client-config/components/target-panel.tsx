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
import { useMutation } from '@tanstack/react-query'
import { Download, Link2, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useSystemConfig } from '@/hooks/use-system-config'
import { handleServerError } from '@/lib/handle-server-error'

import { createClientLink, saveClientConfig, type ClientTarget } from '../api'
import { buildClientPrompt, CLIENT_PRODUCTS } from '../lib/prompt'
import { CCSwitchCard } from './cc-switch-card'
import { TerminalInstallCard } from './terminal-install-card'

type TargetPanelProps = {
  target: ClientTarget
  tokenId: number
  shareEnabled: boolean
}

export function TargetPanel(props: TargetPanelProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const { copyToClipboard } = useCopyToClipboard()
  const [prompt, setPrompt] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const product = CLIENT_PRODUCTS[props.target]

  const promptMutation = useMutation({
    mutationFn: () => createClientLink(props.target, false, props.tokenId),
    onSuccess: (link) => {
      const text = buildClientPrompt(
        t,
        props.target,
        link.guide_url,
        systemName
      )
      setPrompt(text)
      void copyToClipboard(text)
    },
    onError: (error) => handleServerError(error),
  })
  const shareMutation = useMutation({
    mutationFn: () => createClientLink(props.target, true, 0),
    onSuccess: (link) => setShareUrl(link.landing_url),
    onError: (error) => handleServerError(error),
  })
  const downloadMutation = useMutation({
    mutationFn: () => saveClientConfig(props.target, props.tokenId),
    onError: (error) => handleServerError(error),
  })

  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <Card className='lg:col-span-2'>
        <CardHeader>
          <CardTitle>{t('Copy setup prompt')}</CardTitle>
          <CardDescription>
            {t(
              'Paste it into {{product}} on your computer. It sets up the API for you, and your key never appears in the prompt.',
              { product }
            )}
          </CardDescription>
          <div className='group mt-2 flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs transition-colors hover:border-emerald-500/35 hover:bg-emerald-500/10'>
            <div className='mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'>
              <RefreshCw
                className={`size-3.5 transition-transform duration-500 ${
                  promptMutation.isPending
                    ? 'animate-spin'
                    : 'group-hover:rotate-180'
                }`}
              />
            </div>
            <div className='space-y-0.5 leading-relaxed'>
              <div className='flex items-center gap-1.5 font-medium text-foreground'>
                <span className='relative flex size-2'>
                  <span className='absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                  <span className='relative inline-flex size-2 rounded-full bg-emerald-500' />
                </span>
                <span>{t('Auto-sync on model updates')}</span>
              </div>
              <p className='text-muted-foreground'>
                {t(
                  'When the platform adds or updates models, generate and paste this prompt again to refresh your local {{product}} model list without touching other providers.',
                  { product }
                )}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          <Button
            onClick={() => promptMutation.mutate()}
            disabled={promptMutation.isPending}
          >
            <Sparkles />
            {t('Generate prompt')}
          </Button>
          {prompt !== '' && (
            <div className='flex items-start gap-2'>
              <Textarea
                readOnly
                value={prompt}
                rows={3}
                aria-label={t('Setup prompt')}
              />
              <CopyButton value={prompt} variant='outline' />
            </div>
          )}
        </CardContent>
      </Card>

      <TerminalInstallCard target={props.target} tokenId={props.tokenId} />

      {(props.target === 'claude' || props.target === 'codex') && (
        <CCSwitchCard target={props.target} tokenId={props.tokenId} />
      )}

      {props.shareEnabled &&
        (props.target === 'workbuddy' || props.target === 'dsh') && (
          <Card>
            <CardHeader>
              <CardTitle>{t('Share with friends')}</CardTitle>
              <CardDescription>
                {t(
                  'Friends can open the link without an account, copy the prompt and get started. Their new accounts are linked to you.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Button
                variant='outline'
                onClick={() => shareMutation.mutate()}
                disabled={shareMutation.isPending}
              >
                <Link2 />
                {t('Generate share link')}
              </Button>
              {shareUrl !== '' && (
                <div className='flex items-center gap-2'>
                  <Input
                    readOnly
                    value={shareUrl}
                    aria-label={t('Share link')}
                  />
                  <CopyButton value={shareUrl} variant='outline' />
                </div>
              )}
            </CardContent>
          </Card>
        )}

      <Card>
        <CardHeader>
          <CardTitle>{t('Download config file')}</CardTitle>
          <CardDescription>
            {t(
              'Use this only if the prompt does not work. You will have to put the file in place yourself.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant='outline'
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
          >
            <Download />
            {t('Download')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
