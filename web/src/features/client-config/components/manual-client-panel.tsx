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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'

import { TokenPicker, type SetupToken } from './token-picker'
import { manualSetup, type ManualClient, type ManualOs } from '../lib/manual-client'

const SYSTEMS: { id: ManualOs; label: string }[] = [
  { id: 'macos', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
]

export function ManualClientPanel(props: {
  client: ManualClient
  token?: SetupToken
}) {
  const { t } = useTranslation()
  const [os, setOs] = useState<ManualOs>('macos')
  const [picked, setPicked] = useState<SetupToken | null>(props.token ?? null)
  const token = props.token ?? picked
  const setup = token
    ? manualSetup({
        client: props.client,
        os,
        baseUrl: window.location.origin,
        apiKey: token.key,
      })
    : null

  return (
    <div className='flex flex-col gap-4'>
      {token ? null : <TokenPicker onSelect={setPicked} />}
      <div className='flex gap-2'>
        {SYSTEMS.map((system) => (
          <Button
            key={system.id}
            type='button'
            variant={os === system.id ? 'default' : 'outline'}
            onClick={() => setOs(system.id)}
          >
            {system.label}
          </Button>
        ))}
      </div>
      {setup ? (
        <div className='flex flex-col gap-2'>
          <p>{t(setup.steps[0])}</p>
          <pre className='overflow-auto rounded-md bg-muted p-3 text-sm'>
            {setup.command}
          </pre>
          <CopyButton value={setup.command} aria-label={t('Copy setup command')}>
            {t('Copy setup command')}
          </CopyButton>
        </div>
      ) : null}
    </div>
  )
}
