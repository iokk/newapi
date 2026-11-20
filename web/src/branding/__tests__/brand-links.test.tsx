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
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { NavGroup } from '@/components/layout/components/nav-group'
import { checkIsActive } from '@/components/layout/lib/url-utils'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'

import {
  ClientConfigGuideCard,
  QUICK_CONNECT_URL,
  XSEEK_AGENT_URL,
  XseekAgentLink,
} from '../brand-links'

afterEach(() => {
  cleanup()
})

describe('brand navigation links', () => {
  it('exposes Quick Connect and XSEEK Agent in top nav links', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['status'], {
      HeaderNavModules: JSON.stringify({
        home: true,
        console: true,
        pricing: { enabled: true, requireAuth: false },
        docs: true,
        about: true,
      }),
    })
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    }

    const { result } = renderHook(() => useTopNavLinks(), { wrapper: Wrapper })
    expect(result.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Quick Connect',
          href: QUICK_CONNECT_URL,
          external: true,
        }),
        expect.objectContaining({
          title: 'XSEEK Agent',
          href: XSEEK_AGENT_URL,
          external: true,
        }),
      ])
    )
  })

  it('renders XseekAgentLink and ClientConfigGuideCard pointing to live URLs', () => {
    render(
      <>
        <XseekAgentLink />
        <ClientConfigGuideCard />
      </>
    )

    const agentBtn = screen.getByRole('link', { name: 'XSEEK Agent' })
    expect(agentBtn).toHaveAttribute('href', XSEEK_AGENT_URL)
    expect(agentBtn).toHaveAttribute('target', '_blank')

    expect(
      screen.getByRole('link', { name: /Full Quick Connect Guide/ })
    ).toHaveAttribute('href', QUICK_CONNECT_URL)
    expect(
      screen.getByRole('link', { name: /Visit XSEEK Agent/ })
    ).toHaveAttribute('href', XSEEK_AGENT_URL)
  })

  it('renders external sidebar links as new-tab anchors and never marks them active', async () => {
    const item = {
      title: 'XSEEK Agent',
      url: XSEEK_AGENT_URL,
      external: true,
      icon: Sparkles,
    }
    expect(checkIsActive('/dashboard/overview', item)).toBe(false)

    function ExternalSidebarTest() {
      return (
        <SidebarProvider>
          <NavGroup title='Chat' items={[item]} />
        </SidebarProvider>
      )
    }

    const router = createRouter({
      routeTree: createRootRoute({ component: ExternalSidebarTest }),
      history: createMemoryHistory({ initialEntries: ['/dashboard/overview'] }),
    })
    await router.load()
    render(<RouterProvider router={router} />)

    const link = screen.getByRole('link', { name: 'XSEEK Agent' })
    expect(link).toHaveAttribute('href', XSEEK_AGENT_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
