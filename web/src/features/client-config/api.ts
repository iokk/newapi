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
import { api } from '@/lib/api'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

export type ClientTarget = 'workbuddy' | 'dsh'

export type ClientLinkOptions = {
  enabled: boolean
  share_enabled: boolean
  workbuddy_ready: boolean
  dsh_ready: boolean
}

export type ClientLink = {
  code: string
  guide_url: string
  landing_url: string
}

export async function getClientLinkOptions(): Promise<ClientLinkOptions> {
  const res = await api.get('/api/client_link/options')
  return requireServerSuccess(res.data).data
}

export async function createClientLink(
  target: ClientTarget,
  share: boolean
): Promise<ClientLink> {
  const res = await api.post('/api/client_link', { target, share })
  return requireServerSuccess(res.data).data
}

// The file is JSON and so is a business failure, so the body decides which one it is.
export async function saveClientConfig(target: ClientTarget): Promise<void> {
  const res = await api.get('/api/client_link/download', {
    params: { target },
    responseType: 'blob',
  })
  const blob = res.data as Blob
  const parsed: unknown = JSON.parse(await blob.text())
  if ((parsed as { success?: boolean }).success === false) {
    throw createServerError(parsed)
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = target === 'dsh' ? 'dsh.json' : 'models.json'
  link.click()
  URL.revokeObjectURL(url)
}
