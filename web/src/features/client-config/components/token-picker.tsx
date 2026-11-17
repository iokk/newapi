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
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createApiKey, fetchTokenKey, getApiKeys } from '@/features/keys/api'
import {
  API_KEY_FORM_DEFAULT_VALUES,
  transformFormDataToPayload,
} from '@/features/keys/lib/api-key-form'

export type SetupToken = { id: number; key: string; name: string }

export function TokenPicker(props: { onSelect: (token: SetupToken) => void }) {
  const { t } = useTranslation()
  const keys = useQuery({
    queryKey: ['client-setup', 'tokens'],
    queryFn: () => getApiKeys({ size: 100 }),
  })
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const items = keys.data?.data?.items ?? []

  async function choose(item: { id: number; name: string }) {
    const revealed = await fetchTokenKey(item.id)
    if (!revealed.success || !revealed.data?.key) {
      setError(revealed.message || t('Failed to load the API key'))
      return
    }
    props.onSelect({ id: item.id, name: item.name, key: revealed.data.key })
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    setError('')
    const result = await createApiKey(
      transformFormDataToPayload({ ...API_KEY_FORM_DEFAULT_VALUES, name })
    )
    if (!result.success) {
      setError(result.message || t('Failed to create the API key'))
      return
    }
    const list = await getApiKeys({ size: 100 })
    const created = list.data?.items.find((item) => item.name === name)
    if (!created) {
      setError(t('Failed to load the API key'))
      return
    }
    await choose(created)
  }

  if (keys.isLoading) return null

  return (
    <div className='flex flex-col gap-3'>
      {items.length === 0 ? (
        <form className='flex flex-col gap-2' onSubmit={create}>
          <Label htmlFor='client-setup-key-name'>{t('API key name')}</Label>
          <Input
            id='client-setup-key-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type='submit'>{t('Create')}</Button>
        </form>
      ) : (
        items.map((item) => (
          <Button
            key={item.id}
            type='button'
            variant='outline'
            onClick={() => choose(item)}
          >
            {item.name}
          </Button>
        ))
      )}
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
    </div>
  )
}
