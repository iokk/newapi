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
import { Download, Link2, Sparkles } from 'lucide-react'
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
import { TerminalInstallCard } from './terminal-install-card'
import { buildClientPrompt, CLIENT_PRODUCTS } from '../lib/prompt'

type TargetPanelProps = {
  target: ClientTarget
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
    mutationFn: () => createClientLink(props.target, false),
    onSuccess: (link) => {
      const text = buildClientPrompt(t, props.target, link.guide_url, systemName)
      setPrompt(text)
      void copyToClipboard(text)
    },
    onError: (error) => handleServerError(error),
  })
  const shareMutation = useMutation({
    mutationFn: () => createClientLink(props.target, true),
    onSuccess: (link) => setShareUrl(link.landing_url),
    onError: (error) => handleServerError(error),
  })
  const downloadMutation = useMutation({
    mutationFn: () => saveClientConfig(props.target),
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
              <Textarea readOnly value={prompt} rows={3} aria-label={t('Setup prompt')} />
              <CopyButton value={prompt} variant='outline' />
            </div>
          )}
        </CardContent>
      </Card>

      <TerminalInstallCard target={props.target} />

      {props.shareEnabled && (
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
                <Input readOnly value={shareUrl} aria-label={t('Share link')} />
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
