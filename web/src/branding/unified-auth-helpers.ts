/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { getServerErrorMessageKey } from '@/lib/server-error-message'

export const OIDC_BANNER_DISMISS_KEY = 'bozzii_hide_oidc_migration_banner'
export const OIDC_AUTO_RETRY_KEY = 'bozzii_oidc_callback_retried'

export function deriveCasdoorSignupEndpoint(authEndpoint: string): string {
  try {
    const parsed = new URL(authEndpoint)
    if (parsed.pathname.endsWith('/login/oauth/authorize')) {
      parsed.pathname = parsed.pathname.replace(
        /\/login\/oauth\/authorize$/,
        '/signup/oauth/authorize'
      )
      return parsed.toString()
    }
    return authEndpoint
  } catch {
    return authEndpoint
  }
}

export function deriveUnifiedAuthOrigin(
  authEndpoint?: string | null
): string | null {
  if (!authEndpoint) return null
  try {
    const parsed = new URL(authEndpoint)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.origin
  } catch {
    return null
  }
}

export function buildUnifiedLogoutUrl(
  authEndpoint: string | undefined | null,
  postLogoutRedirectUri: string
): string | null {
  const origin = deriveUnifiedAuthOrigin(authEndpoint)
  if (!origin) return null
  const url = new URL('/api/logout', origin)
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)
  return url.toString()
}

export function buildUnifiedAccountUrl(
  authEndpoint?: string | null
): string | null {
  const origin = deriveUnifiedAuthOrigin(authEndpoint)
  return origin ? `${origin}/account` : null
}

export function buildUnifiedForgotUrl(
  authEndpoint?: string | null
): string | null {
  const origin = deriveUnifiedAuthOrigin(authEndpoint)
  return origin ? `${origin}/forget/app-bozzii-api` : null
}

export function isOAuthEmailConflictError(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const record = payload as Record<string, unknown>
  if (record.message_key === 'Email address is already in use') return true
  const messageKey = getServerErrorMessageKey(record)
  if (messageKey === 'Email address is already in use') return true
  if (record.code === 'OAUTH_EMAIL_ALREADY_TAKEN') return true
  const msg = typeof record.message === 'string' ? record.message.trim() : ''
  return (
    msg === 'Email address is already in use' ||
    msg === '邮箱地址已被使用' ||
    msg.includes('Email address is already in use')
  )
}
