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
import { getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { api } from '@/lib/api'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

export type ClientTarget = 'workbuddy' | 'dsh' | 'claude' | 'codex'

export type ClientLinkOptions = {
  enabled: boolean
  share_enabled: boolean
  workbuddy_ready: boolean
  dsh_ready: boolean
  claude_ready: boolean
  codex_ready: boolean
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

export async function getClientApiKeys(): Promise<ApiKey[]> {
  const firstResponse = requireServerSuccess(
    await getApiKeys({ p: 1, size: 100 })
  )
  if (!firstResponse.data) throw new Error('Failed to load API keys')
  const first = firstResponse.data
  const remaining = await Promise.all(
    Array.from(
      { length: Math.max(0, Math.ceil(first.total / first.page_size) - 1) },
      (_, index) => getApiKeys({ p: index + 2, size: first.page_size })
    )
  )
  return [
    ...first.items,
    ...remaining.flatMap(
      (response) => requireServerSuccess(response).data?.items ?? []
    ),
  ]
}

export async function createClientLink(
  target: ClientTarget,
  share: boolean,
  tokenId: number
): Promise<ClientLink> {
  const res = await api.post('/api/client_link', {
    target,
    share,
    token_id: tokenId,
  })
  return requireServerSuccess(res.data).data
}

export async function getClientConfigKey(
  target: ClientTarget,
  tokenId: number
): Promise<string> {
  const res = await api.get('/api/client_link/download', {
    params: { target, token_id: tokenId },
    responseType: 'blob',
  })
  const parsed: unknown = JSON.parse(await (res.data as Blob).text())
  if ((parsed as { success?: boolean }).success === false) {
    throw createServerError(parsed)
  }
  const apiKey = (parsed as { api_key?: unknown }).api_key
  if (typeof apiKey !== 'string' || apiKey === '') {
    throw new Error('Client config has no API key')
  }
  return apiKey
}

// The file is JSON and so is a business failure, so the body decides which one it is.
export async function saveClientConfig(
  target: ClientTarget,
  tokenId: number
): Promise<void> {
  const res = await api.get('/api/client_link/download', {
    params: { target, token_id: tokenId },
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
  link.download = {
    workbuddy: 'models.json',
    dsh: 'dsh.json',
    claude: 'claude-code.json',
    codex: 'codex.json',
  }[target]
  link.click()
  URL.revokeObjectURL(url)
}
