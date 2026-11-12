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
import { Terminal } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import type { ClientTarget } from '../api'

type TerminalInstallCardProps = {
  target: ClientTarget
}

// One-step terminal install: the command downloads the server-rendered script
// and runs it, so no AI client is needed and the key never leaves the machine.
export function TerminalInstallCard(props: TerminalInstallCardProps) {
  const { t } = useTranslation()
  const [command, setCommand] = useState('')

  const commandMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client_link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target: props.target, share: false }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as {
        success: boolean
        data?: { code: string }
      }
      if (!body.success || !body.data) throw new Error('unavailable')
      return body.data.code
    },
    onSuccess: (code) => {
      const file = props.target === 'workbuddy' ? 'install.sh' : 'install.ps1'
      const shell =
        props.target === 'workbuddy'
          ? `bash <(curl -sS ${window.location.origin}/i/${code}/${file})`
          : `iex (irm ${window.location.origin}/i/${code}/${file})`
      setCommand(shell)
    },
    onError: (error) => handleServerError(error),
  })

  if (props.target !== 'workbuddy') return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('One-step install (no AI needed)')}</CardTitle>
        <CardDescription>
          {t(
            'Copy this command and run it in Terminal on your computer. It backs up and merges the config itself.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <Button
          variant='outline'
          onClick={() => commandMutation.mutate()}
          disabled={commandMutation.isPending}
        >
          <Terminal />
          {t('Generate install command')}
        </Button>
        {command !== '' && (
          <div className='flex items-start gap-2'>
            <Textarea
              readOnly
              value={command}
              rows={2}
              aria-label={t('Install command')}
              className='font-mono text-xs'
            />
            <CopyButton value={command} variant='outline' />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
