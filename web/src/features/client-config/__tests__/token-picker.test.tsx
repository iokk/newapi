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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { createApiKey, fetchTokenKey, getApiKeys } from '@/features/keys/api'

import { TokenPicker } from '../components/token-picker'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  fetchTokenKey: vi.fn(),
}))

function renderPicker(onSelect = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <TokenPicker onSelect={onSelect} />
    </QueryClientProvider>
  )
  return onSelect
}

test('selecting a token returns its real key', async () => {
  vi.mocked(getApiKeys).mockResolvedValue({
    success: true,
    data: {
      items: [{ id: 7, name: 'laptop', key: 'sk-masked' } as never],
      total: 1,
      page: 1,
      page_size: 10,
    },
  })
  vi.mocked(fetchTokenKey).mockResolvedValue({
    success: true,
    data: { key: 'sk-real' },
  })
  const onSelect = renderPicker()

  await userEvent.click(await screen.findByRole('button', { name: 'laptop' }))

  expect(onSelect).toHaveBeenCalledWith({
    id: 7,
    name: 'laptop',
    key: 'sk-real',
  })
})

test('shows a create form when there is no token', async () => {
  vi.mocked(getApiKeys).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 10 },
  })
  renderPicker()

  expect(await screen.findByLabelText('API key name')).toBeInTheDocument()
})

test('a failed create does not select a key and shows the server error', async () => {
  vi.mocked(getApiKeys).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 10 },
  })
  vi.mocked(createApiKey).mockResolvedValue({
    success: false,
    message: 'Maximum number of tokens reached (10)',
  })
  const onSelect = renderPicker()
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('API key name'), 'phone')
  await user.click(screen.getByRole('button', { name: 'Create' }))

  expect(onSelect).not.toHaveBeenCalled()
  expect(
    await screen.findByText('Maximum number of tokens reached (10)')
  ).toBeInTheDocument()
})
