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
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { RichContent } from '@/components/rich-content'
import { isLikelyHtml } from '@/lib/content-format'
import { useAuthStore } from '@/stores/auth-store'

import { CTA, Features, Hero, HowItWorks, Stats } from './components'
import { useHomePageContent } from './hooks'

export function Home() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const { content, isLoaded, isUrl } = useHomePageContent()

  if (!isLoaded) {
    // CUSTOM(brand): no shell header here; the landing page brings its own nav.
    return (
      <main className='bg-background flex min-h-screen items-center justify-center'>
        <div className='text-muted-foreground'>{t('Loading...')}</div>
      </main>
    )
  }

  if (content) {
    if (isUrl) {
      // CUSTOM(brand): first-party same-origin landing pages (/brand/home.html) need
      // same-origin cookies/localStorage/fetch; third-party URLs stay strictly sandboxed.
      let isSameOrigin = false
      try {
        if (typeof window !== 'undefined') {
          isSameOrigin =
            new URL(content, window.location.origin).origin ===
            window.location.origin
        }
      } catch {
        isSameOrigin = false
      }
      if (isSameOrigin) {
        return (
          // oxlint-disable-next-line react/iframe-missing-sandbox -- trusted first-party same-origin landing page
          <iframe
            src={content}
            className='h-screen w-full border-none'
            title={t('Custom Home Page')}
            allow='clipboard-write'
          />
        )
      }
      return (
        <iframe
          src={content}
          className='h-screen w-full border-none'
          title={t('Custom Home Page')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
        />
      )
    }

    const contentIsHtml = isLikelyHtml(content)

    if (contentIsHtml) {
      return (
        <PublicLayout showMainContainer={false}>
          <RichContent
            mode='html'
            htmlVariant='isolated'
            content={content}
            className='custom-home-content'
          />
        </PublicLayout>
      )
    }

    return (
      <PublicLayout>
        <div className='mx-auto max-w-6xl px-4 py-8'>
          <RichContent
            mode='markdown'
            content={content}
            className='custom-home-content'
          />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <Hero isAuthenticated={isAuthenticated} />
      <Stats />
      <Features />
      <HowItWorks />
      <CTA isAuthenticated={isAuthenticated} />
      <Footer />
    </PublicLayout>
  )
}
