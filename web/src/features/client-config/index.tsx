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
import { Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { getClientLinkOptions, type ClientTarget } from './api'
import { TargetPanel } from './components/target-panel'
import { CLIENT_PRODUCTS } from './lib/prompt'

const ONE_CLICK = ['workbuddy', 'dsh'] as const
const TABS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'workbuddy', label: CLIENT_PRODUCTS.workbuddy },
  { id: 'dsh', label: CLIENT_PRODUCTS.dsh },
  { id: 'codex', label: 'Codex' },
] as const

export function ClientConfig() {
  const { t } = useTranslation()
  const options = useQuery({
    queryKey: ['client-link', 'options'],
    queryFn: getClientLinkOptions,
  })
  const ready = {
    workbuddy: options.data?.workbuddy_ready === true,
    dsh: options.data?.dsh_ready === true,
  }
  const unavailable = options.data?.enabled === false

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Client Setup')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        {unavailable ? (
          <EmptyState
            icon={Plug}
            title={t('Client setup is not available')}
            description={t(
              'Ask the administrator to enable it and configure the models.'
            )}
          />
        ) : (
          <Tabs defaultValue='claude-code'>
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  disabled={
                    (ONE_CLICK as readonly string[]).includes(tab.id) &&
                    !ready[tab.id as ClientTarget]
                  }
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {ONE_CLICK.map((target) => (
              <TabsContent key={target} value={target}>
                <TargetPanel
                  target={target}
                  shareEnabled={options.data?.share_enabled === true}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
