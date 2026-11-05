/*
CUSTOM(brand): regression tests for hiding wallet entry points on the overview
when the admin turns off the Wallet sidebar module (personal.topup).
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { OverviewDashboard } from '../overview-dashboard'

let client: QueryClient
let sidebarModulesAdmin: string | undefined

function sidebarWith(topup: boolean): string {
  return JSON.stringify({
    personal: { enabled: true, topup, personal: true, security: true },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  // A new user with an API key but no balance and no requests, so the setup
  // guide is open and still lists the "Add credits" step.
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'new-user', role: 1 })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  sidebarModulesAdmin = undefined
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    switch (url) {
      case '/api/token/?p=1&size=10':
        return {
          data: {
            success: true,
            data: {
              items: [{ id: 1, name: 'App key', key: 'masked', status: 1 }],
            },
          },
        }
      case '/api/status':
        return {
          data: {
            data: {
              api_info_enabled: false,
              announcements_enabled: false,
              faq_enabled: false,
              uptime_kuma_enabled: false,
              SidebarModulesAdmin: sidebarModulesAdmin,
            },
          },
        }
      case '/api/user/models':
        return { data: { success: true, data: ['gpt-4o-mini'] } }
      case '/api/data/self':
        return { data: { success: true, data: [] } }
      default:
        throw new Error(`Unexpected dashboard request: ${url}`)
    }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
})

async function renderOverview() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('overview wallet entry points', () => {
  it('lists the credits step and the wallet button while the wallet module is on', async () => {
    sidebarModulesAdmin = sidebarWith(true)
    await renderOverview()

    await screen.findByRole('button', { name: 'Hide setup guide' })
    expect(screen.getByText('Add credits')).toBeVisible()
    expect(screen.getByRole('button', { name: /Wallet/ })).toBeVisible()
  })

  it('counts the credits step in the progress while the wallet module is on', async () => {
    const user = userEvent.setup()
    sidebarModulesAdmin = sidebarWith(true)
    await renderOverview()

    await user.click(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    )
    expect(screen.getByText('Setup progress: 1/3')).toBeVisible()
  })

  it('removes the credits step and the wallet button when the wallet module is off', async () => {
    sidebarModulesAdmin = sidebarWith(false)
    await renderOverview()

    await screen.findByRole('button', { name: 'Hide setup guide' })
    expect(screen.getByText('Send a request')).toBeVisible()
    expect(screen.queryByText('Add credits')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Wallet/ })
    ).not.toBeInTheDocument()
  })

  it('counts progress over the remaining steps when the wallet module is off', async () => {
    const user = userEvent.setup()
    sidebarModulesAdmin = sidebarWith(false)
    await renderOverview()

    await user.click(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    )
    expect(screen.getByText('Setup progress: 1/2')).toBeVisible()
  })
})
