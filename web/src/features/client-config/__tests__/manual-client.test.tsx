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

import { getApiKeys } from '@/features/keys/api'

import { ManualClientPanel } from '../components/manual-client-panel'
import { manualSetup } from '../lib/manual-client'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  fetchTokenKey: vi.fn(),
}))

const base = { baseUrl: 'https://ai.example', apiKey: 'sk-test' }

test('builds Claude Code and Codex commands for each system', () => {
  expect(manualSetup({ client: 'claude-code', os: 'macos', ...base }).command)
    .toBe(`export ANTHROPIC_BASE_URL="https://ai.example"
export ANTHROPIC_API_KEY="sk-test"`)
  expect(manualSetup({ client: 'claude-code', os: 'windows', ...base }).command)
    .toBe(
      'setx ANTHROPIC_BASE_URL "https://ai.example" && setx ANTHROPIC_API_KEY "sk-test"'
    )
  expect(manualSetup({ client: 'codex', os: 'linux', ...base }).command).toBe(
    `export OPENAI_BASE_URL="https://ai.example/v1"
export OPENAI_API_KEY="sk-test"`
  )
  expect(manualSetup({ client: 'codex', os: 'windows', ...base }).command).toBe(
    'setx OPENAI_BASE_URL "https://ai.example/v1" && setx OPENAI_API_KEY "sk-test"'
  )
})

test('changing the system changes the copied command and hides the key until one is chosen', async () => {
  vi.stubGlobal('location', { origin: 'https://ai.example' })
  vi.mocked(getApiKeys).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 10 },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const shown = render(
    <ManualClientPanel
      client='claude-code'
      token={{ id: 1, name: 'laptop', key: 'sk-test' }}
    />
  )

  expect(
    screen.getByText(/ANTHROPIC_BASE_URL="https:\/\/ai.example"/)
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Windows' }))
  expect(screen.getByText(/setx ANTHROPIC_BASE_URL/)).toBeInTheDocument()
  expect(screen.queryByText(/export ANTHROPIC/)).not.toBeInTheDocument()
  shown.unmount()

  render(
    <QueryClientProvider client={client}>
      <ManualClientPanel client='claude-code' />
    </QueryClientProvider>
  )
  expect(screen.queryByText('sk-test')).not.toBeInTheDocument()
})
