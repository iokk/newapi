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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { API_KEY_STATUS } from '@/features/keys/constants'

import { getClientApiKeys } from '../api'

type ApiKeySelectorProps = {
  value: number
  onValueChange: (value: number) => void
}

export function ApiKeySelector(props: ApiKeySelectorProps) {
  const { t } = useTranslation()
  const keys = useQuery({
    queryKey: ['client-link', 'api-keys'],
    queryFn: getClientApiKeys,
  })
  const options = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    const available = (keys.data ?? []).filter(
      (key) =>
        key.status === API_KEY_STATUS.ENABLED &&
        (key.expired_time === -1 || key.expired_time > now)
    )
    return [
      { value: '0', label: t('Automatic per-client key') },
      ...available.map((key) => ({
        value: String(key.id),
        label: `${key.name} · ${key.key}`,
      })),
    ]
  }, [keys.data, t])

  return (
    <div className='mb-4 max-w-xl space-y-2'>
      <Label htmlFor='client-api-key'>{t('API Key')}</Label>
      <Combobox
        id='client-api-key'
        aria-label={t('API Key')}
        options={options}
        value={String(props.value)}
        onValueChange={(value) => props.onValueChange(Number(value ?? 0))}
        placeholder={t('Select an API key')}
        emptyText={t('No API keys found')}
        className='w-full'
      />
      {keys.isError && (
        <p className='text-muted-foreground text-sm' role='alert'>
          {t('Could not load API keys. You can still use automatic keys.')}
        </p>
      )}
    </div>
  )
}
