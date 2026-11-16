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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

import { ClientConfig } from '../index'

vi.mock('@/lib/copy-to-clipboard', () => ({ copyToClipboard: vi.fn() }))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: 'Acme' }),
}))

function token(id: number, name: string, status = 1, expiredTime = -1) {
  return {
    id,
    name,
    key: `${name.slice(0, 2)}****${name.slice(-2)}`,
    status,
    remain_quota: 0,
    used_quota: 0,
    unlimited_quota: true,
    expired_time: expiredTime,
    created_time: 0,
    accessed_time: 0,
    group: 'default',
    model_limits_enabled: false,
  }
}

function options() {
  return {
    success: true,
    data: {
      enabled: true,
      share_enabled: true,
      workbuddy_ready: true,
      dsh_ready: true,
      claude_ready: false,
      codex_ready: false,
    },
  }
}

function renderConfig() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <ClientConfig />
    </QueryClientProvider>
  )
  return { client, view }
}

beforeEach(() => {
  vi.mocked(copyToClipboard).mockResolvedValue(true)
  vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url === '/api/client_link') {
      return {
        data: {
          success: true,
          data: {
            code: 'u-test',
            guide_url: 'https://example.com/c/u-test?t=workbuddy',
            landing_url: 'https://example.com/s/u-test?t=workbuddy',
          },
        },
      }
    }
    throw new Error(`unexpected POST ${url}`)
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('client API key selection', () => {
  it('loads every token page and only offers enabled unexpired keys', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/client_link/options') return { data: options() }
      if (url === '/api/token/?p=1&size=100') {
        return {
          data: {
            success: true,
            data: {
              items: [
                token(7, 'laptop'),
                token(8, 'disabled', 2),
                token(9, 'expired', 1, 1),
              ],
              total: 101,
              page: 1,
              page_size: 100,
            },
          },
        }
      }
      if (url === '/api/token/?p=2&size=100') {
        return {
          data: {
            success: true,
            data: {
              items: [token(10, 'office')],
              total: 101,
              page: 2,
              page_size: 100,
            },
          },
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    renderConfig()
    const user = userEvent.setup()
    const selector = await screen.findByRole('combobox', { name: 'API Key' })
    await user.click(selector)

    expect(await screen.findByRole('option', { name: /laptop/ })).toBeVisible()
    expect(screen.getByRole('option', { name: /office/ })).toBeVisible()
    expect(
      screen.queryByRole('option', { name: /disabled/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /expired/ })
    ).not.toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/token/?p=2&size=100')
  })

  it.each(['empty', 'failed'])(
    'keeps automatic selection when the token list is %s',
    async (mode) => {
      vi.spyOn(api, 'get').mockImplementation(async (url) => {
        if (url === '/api/client_link/options') return { data: options() }
        if (url.startsWith('/api/token/')) {
          if (mode === 'failed') throw new Error('offline')
          return {
            data: {
              success: true,
              data: { items: [], total: 0, page: 1, page_size: 100 },
            },
          }
        }
        throw new Error(`unexpected GET ${url}`)
      })
      renderConfig()
      const user = userEvent.setup()
      const selector = await screen.findByRole('combobox', { name: 'API Key' })
      await user.click(selector)

      expect(
        await screen.findByRole('option', { name: 'Automatic per-client key' })
      ).toBeVisible()
    }
  )

  it('uses the selected key and clears all generated output when it changes', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/client_link/options') return { data: options() }
      if (url.startsWith('/api/token/')) {
        return {
          data: {
            success: true,
            data: {
              items: [token(7, 'laptop')],
              total: 1,
              page: 1,
              page_size: 100,
            },
          },
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    renderConfig()
    const user = userEvent.setup()
    const selector = await screen.findByRole('combobox', { name: 'API Key' })
    await user.click(selector)
    await user.click(await screen.findByRole('option', { name: /laptop/ }))

    await user.click(screen.getByRole('button', { name: 'Generate prompt' }))
    expect(
      await screen.findByRole('textbox', { name: 'Setup prompt' })
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Generate share link' })
    )
    expect(
      await screen.findByRole('textbox', { name: 'Share link' })
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Generate install command' })
    )
    expect(
      await screen.findByRole('textbox', { name: 'Install command' })
    ).toBeVisible()

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/client_link', {
        target: 'workbuddy',
        share: false,
        token_id: 7,
      })
      expect(api.post).toHaveBeenCalledWith('/api/client_link', {
        target: 'workbuddy',
        share: true,
        token_id: 0,
      })
    })

    await user.click(selector)
    await user.click(
      await screen.findByRole('option', { name: 'Automatic per-client key' })
    )

    expect(
      screen.queryByRole('textbox', { name: 'Setup prompt' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Share link' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Install command' })
    ).not.toBeInTheDocument()
  })
})
