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
*/
import { Link, useRouterState } from '@tanstack/react-router'
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildUnifiedAccountUrl,
  buildUnifiedForgotUrl,
  getOidcBannerDismissKey,
} from '@/branding/unified-auth-helpers'
import { Dialog } from '@/components/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { AuthLayout } from '@/features/auth/auth-layout'
import { loginMethodLabel } from '@/features/security/components/login-session-utils'
import { useStatus } from '@/hooks/use-status'
import { api } from '@/lib/api'
import dayjs from '@/lib/dayjs'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'
import { useAuthStore, type LoginSession } from '@/stores/auth-store'

interface UnifiedAuthPrimaryCardProps {
  mode: 'login' | 'signup'
  displayName: string
  isLoading?: boolean
  disabled?: boolean
  onPrimaryClick: () => void
  onSwitchAccountClick?: () => void
}

export function UnifiedAuthPrimaryCard({
  mode,
  displayName,
  isLoading = false,
  disabled = false,
  onPrimaryClick,
  onSwitchAccountClick,
}: UnifiedAuthPrimaryCardProps) {
  const { t } = useTranslation()
  const isSignup = mode === 'signup'
  let buttonIcon: ReactNode = <ShieldCheck className='size-4' />
  if (isLoading) {
    buttonIcon = <Loader2 className='size-4 animate-spin' />
  } else if (isSignup) {
    buttonIcon = <UserPlus className='size-4' />
  }

  return (
    <div className='bg-muted/35 border-border/80 space-y-3 rounded-xl border p-4'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-primary inline-flex items-center gap-1.5 text-xs font-medium'>
          <ShieldCheck className='size-3.5' />
          {t('Unified SSO')}
        </span>
        <span className='text-muted-foreground text-xs'>
          {t('Recommended')}
        </span>
      </div>

      <Button
        type='button'
        disabled={disabled || isLoading}
        onClick={onPrimaryClick}
        className='h-11 w-full justify-center gap-2 rounded-lg font-medium'
      >
        {buttonIcon}
        {isSignup
          ? t('Sign up with {{name}}', { name: displayName })
          : t('Sign in with {{name}}', { name: displayName })}
      </Button>

      <p className='text-muted-foreground text-center text-xs leading-relaxed'>
        {isSignup
          ? t(
              'Shared account with shop.bozzii.com — register once to access all Bozzii services.'
            )
          : t(
              'Shared account with shop.bozzii.com — no separate registration needed.'
            )}
      </p>

      {!isSignup && onSwitchAccountClick && (
        <div className='flex justify-center pt-0.5'>
          <button
            type='button'
            disabled={disabled || isLoading}
            onClick={onSwitchAccountClick}
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 transition-colors hover:underline disabled:opacity-50'
          >
            <RefreshCw className='size-3' />
            {t('Switch unified account')}
          </button>
        </div>
      )}
    </div>
  )
}

export function LegacyOidcMigrationBanner() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const user = useAuthStore((s) => s.auth.user)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const dismissKey = getOidcBannerDismissKey(user?.id)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [dismissKey])

  if (
    dismissed ||
    !status?.oidc_enabled ||
    !user ||
    Boolean(user.oidc_id) ||
    pathname === '/security'
  ) {
    return null
  }

  const displayName = status.oidc_display_name?.trim() || 'OIDC'

  const handleDismiss = () => {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(dismissKey, '1')
    } catch {
      // ignore storage failure
    }
  }

  return (
    <div
      role='status'
      className='border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs sm:text-sm'
    >
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <ShieldCheck className='size-4 shrink-0 text-amber-600 dark:text-amber-400' />
          <p className='truncate sm:whitespace-normal'>
            {t(
              'Your legacy account is not yet linked to {{name}}. Bind it now to share one account with shop.bozzii.com and keep your existing balance and API keys.',
              { name: displayName }
            )}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Link
            to='/security'
            className={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'h-7 px-2.5 text-xs'
            )}
          >
            {t('Bind now')}
          </Link>
          <button
            type='button'
            onClick={handleDismiss}
            aria-label={t('Dismiss')}
            className='text-muted-foreground hover:text-foreground rounded p-1 transition-colors'
          >
            <X className='size-3.5' />
          </button>
        </div>
      </div>
    </div>
  )
}

export function UnifiedAccountSecurityNotice({
  variant = 'security',
}: {
  variant?: 'security' | 'forgot-password'
}) {
  const { t } = useTranslation()
  const { status } = useStatus()

  if (!status?.oidc_enabled) return null

  const displayName = status.oidc_display_name?.trim() || 'OIDC'
  const targetUrl =
    variant === 'forgot-password'
      ? buildUnifiedForgotUrl(status.oidc_authorization_endpoint)
      : buildUnifiedAccountUrl(status.oidc_authorization_endpoint)

  if (!targetUrl) return null

  return (
    <div className='bg-muted/40 border-border/80 flex flex-col gap-2.5 rounded-xl border p-3.5 text-sm sm:flex-row sm:items-center sm:justify-between'>
      <div className='space-y-0.5'>
        <div className='flex items-center gap-1.5 font-medium'>
          <ShieldCheck className='text-primary size-4 shrink-0' />
          <span>
            {variant === 'forgot-password'
              ? t('Reset password via {{name}}', { name: displayName })
              : t('Managed by {{name}}', { name: displayName })}
          </span>
        </div>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {variant === 'forgot-password'
            ? t(
                'Users registered with {{name}} should reset their password in the Unified Auth Center. The form below is for legacy local accounts only.',
                { name: displayName }
              )
            : t(
                'Password and email changes below only affect legacy local login on this site. To update your unified account credentials, visit the Unified Auth Center.'
              )}
        </p>
      </div>
      <a
        href={targetUrl}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(
          buttonVariants({
            variant: variant === 'forgot-password' ? 'default' : 'outline',
            size: 'sm',
          }),
          'h-8 shrink-0 gap-1.5 text-xs'
        )}
      >
        {variant === 'forgot-password'
          ? t('Open Auth Center reset')
          : t('Manage in Auth Center')}
        <ExternalLink className='size-3.5 opacity-70' />
      </a>
    </div>
  )
}

export function OAuthEmailConflictCard({
  displayName,
}: {
  displayName: string
}) {
  const { t } = useTranslation()

  return (
    <AuthLayout>
      <div className='w-full space-y-6'>
        <div className='flex flex-col items-center space-y-3 text-center'>
          <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400'>
            <AlertTriangle className='size-7' />
          </div>
          <h2 className='text-xl font-semibold tracking-tight'>
            {t('Existing account found for this email')}
          </h2>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {t(
              'To protect your existing balance and API keys, this email will not be merged automatically.'
            )}
          </p>
        </div>

        <ol className='bg-muted/40 border-border/80 text-muted-foreground list-decimal space-y-2 rounded-xl border p-4 ps-8 text-sm'>
          <li>
            {t(
              'Sign in once with your original site username/email and password.'
            )}
          </li>
          <li>
            {t(
              'Open Security & Access → Account Bindings and click Bind next to {{name}}.',
              { name: displayName }
            )}
          </li>
          <li>
            {t(
              'After binding, your balance, tokens, and usage history stay intact and you can sign in with {{name}} everywhere.',
              { name: displayName }
            )}
          </li>
        </ol>

        <div className='flex flex-col gap-2'>
          <Link
            to='/sign-in'
            search={{ legacy: '1', redirect: '/security' }}
            className={cn(
              buttonVariants({ variant: 'default' }),
              'h-11 w-full justify-center rounded-lg'
            )}
          >
            {t('Sign in with legacy password to bind')}
          </Link>
          <div className='flex items-center justify-between gap-2 pt-1'>
            <Link
              to='/forgot-password'
              className='text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline'
            >
              {t('Forgot password?')}
            </Link>
            <Link
              to='/sign-in'
              className='text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline'
            >
              {t('Back to sign in')}
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}

export function AdminUserSessionsDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: number; username: string }
}) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [sessions, setSessions] = useState<LoginSession[]>([])
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState(false)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{
        success: boolean
        message?: string
        data?: LoginSession[]
      }>(`/api/user/${user.id}/sessions`)
      if (res.data?.success) {
        setSessions(res.data.data ?? [])
      } else {
        handleServerError(res.data, t('Failed to load login sessions'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to load login sessions'))
    } finally {
      setLoading(false)
    }
  }, [t, user.id])

  useEffect(() => {
    if (open) {
      void loadSessions()
    }
  }, [open, loadSessions])

  const handleRevokeAll = async () => {
    setRevoking(true)
    try {
      const res = await api.delete<{
        success: boolean
        message?: string
        data?: { revoked_count?: number }
      }>(`/api/user/${user.id}/sessions`)
      if (res.data?.success) {
        toast.success(
          t('Revoked {{count}} active sessions for {{username}}', {
            count: res.data.data?.revoked_count ?? 0,
            username: user.username,
          })
        )
        await loadSessions()
      } else {
        handleServerError(res.data, t('Failed to revoke login sessions'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to revoke login sessions'))
    } finally {
      setRevoking(false)
    }
  }

  let sessionListContent: ReactNode
  if (loading) {
    sessionListContent = (
      <div className='text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm'>
        <Loader2 className='size-4 animate-spin' />
        {t('Loading...')}
      </div>
    )
  } else if (sessions.length === 0) {
    sessionListContent = (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        {t('No active login sessions found.')}
      </p>
    )
  } else {
    sessionListContent = (
      <ul className='max-h-72 space-y-2 overflow-y-auto'>
        {sessions.map((s) => (
          <li
            key={s.sid}
            className='border-border/80 flex items-start gap-2.5 rounded-lg border p-3 text-xs'
          >
            <MonitorSmartphone className='text-muted-foreground mt-0.5 size-4 shrink-0' />
            <div className='min-w-0 flex-1 space-y-1'>
              <div className='flex flex-wrap items-center gap-2 font-medium'>
                <span>
                  {loginMethodLabel(
                    s.login_method,
                    t,
                    status?.oidc_display_name
                  )}
                </span>
                <span className='text-muted-foreground font-mono'>
                  {s.ip || '-'}
                </span>
              </div>
              <p className='text-muted-foreground truncate'>
                {s.user_agent || '-'}
              </p>
              <p className='text-muted-foreground'>
                {t('Last active')}:{' '}
                {dayjs.unix(s.last_active_at).format('YYYY-MM-DD HH:mm:ss')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Login Sessions — {{username}}', { username: user.username })}
      description={t(
        'Inspect active dashboard sessions for this user or force sign-out across all devices.'
      )}
      contentClassName='max-w-lg'
      contentHeight='auto'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={revoking}
          >
            {t('Close')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            onClick={() => void handleRevokeAll()}
            disabled={loading || revoking || sessions.length === 0}
            className='gap-1.5'
          >
            {revoking ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <LogOut className='size-4' />
            )}
            {t('Force sign out all sessions')}
          </Button>
        </>
      }
    >
      {sessionListContent}
    </Dialog>
  )
}
