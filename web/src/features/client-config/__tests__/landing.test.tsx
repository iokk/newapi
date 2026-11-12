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
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { copyToClipboard } from '@/lib/copy-to-clipboard'

import { ClientLinkLanding } from '../landing'

vi.mock('@/lib/copy-to-clipboard', () => ({ copyToClipboard: vi.fn() }))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: 'Acme' }),
}))

beforeEach(() => {
  vi.mocked(copyToClipboard).mockReset()
})

test('copies the prompt on open and confirms it', async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(true)
  render(<ClientLinkLanding code='a-Ab12' target='workbuddy' />)

  expect(
    await screen.findByRole('heading', { name: 'Prompt copied' })
  ).toBeVisible()
  expect(copyToClipboard).toHaveBeenCalledWith(
    expect.stringContaining(`${window.location.origin}/c/a-Ab12?t=workbuddy`)
  )
})

test('keeps the prompt and a copy button when the browser refuses the copy', async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(false)
  render(<ClientLinkLanding code='u-xyz' target='dsh' />)

  expect(
    await screen.findByRole('heading', { name: 'Copy the prompt' })
  ).toBeVisible()
  const textbox = screen.getByRole('textbox', { name: 'Setup prompt' })
  expect(textbox).toHaveDisplayValue(/\/c\/u-xyz\?t=dsh/)
  expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible()
})
