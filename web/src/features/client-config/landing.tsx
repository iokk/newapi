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
import { Check, Copy } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Textarea } from '@/components/ui/textarea'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useSystemConfig } from '@/hooks/use-system-config'

import type { ClientTarget } from './api'
import { buildClientPrompt, CLIENT_PRODUCTS } from './lib/prompt'

type ClientLinkLandingProps = {
  code: string
  target: ClientTarget
}

// Opened from a shared link (often inside WeChat) by someone who may not have an account.
export function ClientLinkLanding(props: ClientLinkLandingProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const product = CLIENT_PRODUCTS[props.target]
  const guideUrl = `${window.location.origin}/c/${props.code}?t=${props.target}`
  const prompt = buildClientPrompt(t, props.target, guideUrl, systemName)
  const copied = copiedText === prompt

  useEffect(() => {
    // Browsers may refuse a copy without a tap, so the button below stays available.
    void copyToClipboard(prompt)
  }, [prompt, copyToClipboard])

  return (
    <main className='mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 p-6'>
      <div className='flex flex-col items-center gap-3 text-center'>
        <div className='bg-success/15 text-success flex size-14 items-center justify-center rounded-full'>
          {copied ? (
            <Check className='size-8' aria-hidden='true' />
          ) : (
            <Copy className='size-8' aria-hidden='true' />
          )}
        </div>
        <h1 className='text-2xl font-semibold'>
          {copied ? t('Prompt copied') : t('Copy the prompt')}
        </h1>
        <p className='text-muted-foreground'>
          {t('Go to {{product}} and paste it', { product })}
        </p>
      </div>
      <ol className='list-decimal space-y-1 pl-5 text-sm'>
        <li>{t('Install {{product}} on your computer if you have not.', { product })}</li>
        <li>
          {t(
            'Open {{product}} on your phone or computer and choose your computer as the device, not cloud mode.',
            { product }
          )}
        </li>
        <li>{t('Paste the prompt and send it.')}</li>
      </ol>
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>
          {t('If pasting does not work, press and hold the text below to copy it.')}
        </p>
        <Textarea readOnly value={prompt} rows={4} aria-label={t('Setup prompt')} />
        <CopyButton
          value={prompt}
          variant='default'
          size='lg'
          className='w-full'
          aria-label={t('Copy prompt')}
        >
          {t('Copy prompt')}
        </CopyButton>
      </div>
    </main>
  )
}
