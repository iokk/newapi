import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  clearAffiliateCode,
  getAffiliateCode,
  sanitizeAffiliateCode,
  saveAffiliateCode,
} from '@/features/auth/lib/storage'
import { buildOAuthAuthorizationUrl, buildOIDCOAuthUrl } from '@/lib/oauth'

import { UnifiedAuthPrimaryCard } from '../unified-auth'
import {
  buildUnifiedAccountUrl,
  buildUnifiedForgotUrl,
  buildUnifiedLogoutUrl,
  clearBrandAuthClientState,
  deriveCasdoorSignupEndpoint,
  getOidcBannerDismissKey,
  isOAuthEmailConflictError,
  OIDC_AUTO_RETRY_KEY,
  OIDC_PENDING_REDIRECT_KEY,
} from '../unified-auth-helpers'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (!params) return key
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
        key
      )
    },
  }),
}))

describe('unified-auth helpers', () => {
  it('derives Casdoor signup authorize endpoint and rejects non-HTTP protocols', () => {
    expect(
      deriveCasdoorSignupEndpoint(
        'https://auth.bozzii.com/login/oauth/authorize'
      )
    ).toBe('https://auth.bozzii.com/signup/oauth/authorize')
    expect(
      deriveCasdoorSignupEndpoint('https://idp.example.com/oauth2/authorize')
    ).toBe('https://idp.example.com/oauth2/authorize')
    expect(deriveCasdoorSignupEndpoint('javascript:alert(1)')).toBe('')
    expect(() =>
      buildOIDCOAuthUrl('javascript:alert(1)', 'cid', 'st')
    ).toThrow()
  })

  it('requires prompt=login when building OIDC binding URL', () => {
    const url = buildOAuthAuthorizationUrl('oidc', 'bind-state', {
      oidc_enabled: true,
      oidc_client_id: '15cddc259a67891b0d1c871b904e1bc1',
      oidc_authorization_endpoint:
        'https://auth.bozzii.com/login/oauth/authorize',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('prompt')).toBe('login')
    expect(parsed.searchParams.get('client_id')).toBe(
      '15cddc259a67891b0d1c871b904e1bc1'
    )
  })

  it('validates affiliate codes and purges poisoned localStorage entries', () => {
    expect(sanitizeAffiliateCode('  bozzii_2026-ok  ')).toBe('bozzii_2026-ok')
    expect(sanitizeAffiliateCode('a'.repeat(33))).toBe('')
    expect(sanitizeAffiliateCode('bad code!')).toBe('')

    window.localStorage.setItem('aff', 'x'.repeat(40))
    expect(getAffiliateCode()).toBe('')
    expect(window.localStorage.getItem('aff')).toBeNull()

    saveAffiliateCode('valid_ref_123')
    expect(getAffiliateCode()).toBe('valid_ref_123')
    clearAffiliateCode()
    expect(getAffiliateCode()).toBe('')
  })

  it('scopes banner dismiss keys per user and clears brand auth client state', () => {
    expect(getOidcBannerDismissKey(42)).toBe(
      'bozzii_hide_oidc_migration_banner:42'
    )
    window.sessionStorage.setItem(getOidcBannerDismissKey(42), '1')
    window.sessionStorage.setItem(OIDC_AUTO_RETRY_KEY, '1')
    window.sessionStorage.setItem(OIDC_PENDING_REDIRECT_KEY, '/wallet')
    window.sessionStorage.setItem('oauth_login_redirect:abc', '/pricing')
    window.localStorage.setItem('bozzii_dismissed_announcement_id', 'ann-1')
    window.localStorage.setItem('bozzii_overview_setup_guide_override', 'hide')

    clearBrandAuthClientState()

    expect(window.sessionStorage.getItem(getOidcBannerDismissKey(42))).toBeNull()
    expect(window.sessionStorage.getItem(OIDC_AUTO_RETRY_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(OIDC_PENDING_REDIRECT_KEY)).toBeNull()
    expect(window.sessionStorage.getItem('oauth_login_redirect:abc')).toBeNull()
    expect(
      window.localStorage.getItem('bozzii_dismissed_announcement_id')
    ).toBeNull()
    expect(
      window.localStorage.getItem('bozzii_overview_setup_guide_override')
    ).toBeNull()
  })

  it('builds unified logout, account, and forgot-password URLs', () => {
    const authEndpoint = 'https://auth.bozzii.com/login/oauth/authorize'
    expect(
      buildUnifiedLogoutUrl(
        authEndpoint,
        'https://ai.bozzii.com/',
        '15cddc259a67891b0d1c871b904e1bc1'
      )
    ).toBe(
      'https://auth.bozzii.com/api/logout?client_id=15cddc259a67891b0d1c871b904e1bc1&post_logout_redirect_uri=https%3A%2F%2Fai.bozzii.com%2F'
    )
    expect(
      buildUnifiedLogoutUrl(authEndpoint, 'https://ai.bozzii.com/', '  ')
    ).toBe(
      'https://auth.bozzii.com/api/logout?post_logout_redirect_uri=https%3A%2F%2Fai.bozzii.com%2F'
    )
    expect(buildUnifiedAccountUrl(authEndpoint)).toBe(
      'https://auth.bozzii.com/account'
    )
    expect(buildUnifiedForgotUrl(authEndpoint)).toBe(
      'https://auth.bozzii.com/forget/app-bozzii-api'
    )
    expect(buildUnifiedLogoutUrl('', 'https://ai.bozzii.com/')).toBeNull()
  })

  it('detects OAuth email conflict errors from message_key or message', () => {
    expect(
      isOAuthEmailConflictError({
        success: false,
        message_key: 'Email address is already in use',
      })
    ).toBe(true)
    expect(
      isOAuthEmailConflictError({
        success: false,
        message: '邮箱地址已被使用',
      })
    ).toBe(true)
    expect(
      isOAuthEmailConflictError({
        success: false,
        message: 'Invalid state',
      })
    ).toBe(false)
  })
})

describe('UnifiedAuthPrimaryCard', () => {
  it('renders signup CTA and triggers primary click', () => {
    const onPrimary = vi.fn()
    render(
      <UnifiedAuthPrimaryCard
        mode='signup'
        displayName='铂子统一账号'
        onPrimaryClick={onPrimary}
      />
    )
    const btn = screen.getByRole('button', { name: /Sign up with 铂子统一账号/ })
    fireEvent.click(btn)
    expect(onPrimary).toHaveBeenCalledTimes(1)
  })

  it('renders login CTA and switch-account trigger', () => {
    const onPrimary = vi.fn()
    const onSwitch = vi.fn()
    render(
      <UnifiedAuthPrimaryCard
        mode='login'
        displayName='铂子统一账号'
        onPrimaryClick={onPrimary}
        onSwitchAccountClick={onSwitch}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Sign in with 铂子统一账号/ })
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Switch unified account/ })
    )
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })
})
