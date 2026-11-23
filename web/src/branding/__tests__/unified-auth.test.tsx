import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UnifiedAuthPrimaryCard } from '../unified-auth'
import {
  buildUnifiedAccountUrl,
  buildUnifiedForgotUrl,
  buildUnifiedLogoutUrl,
  deriveCasdoorSignupEndpoint,
  isOAuthEmailConflictError,
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
  it('derives Casdoor signup authorize endpoint from login authorize endpoint', () => {
    expect(
      deriveCasdoorSignupEndpoint(
        'https://auth.bozzii.com/login/oauth/authorize'
      )
    ).toBe('https://auth.bozzii.com/signup/oauth/authorize')
    expect(
      deriveCasdoorSignupEndpoint('https://idp.example.com/oauth2/authorize')
    ).toBe('https://idp.example.com/oauth2/authorize')
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
