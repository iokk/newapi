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
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { buildUnifiedLogoutUrl } from '@/branding/unified-auth-helpers'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { logout } from '@/features/auth/api'
import { useStatus } from '@/hooks/use-status'
import { clearAuthenticatedClientState } from '@/lib/auth-session'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status } = useStatus()
  const user = useAuthStore((s) => s.auth.user)
  const session = useAuthStore((s) => s.auth.session)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const oidcEnabled = Boolean(status?.oidc_enabled)
  // CUSTOM(brand): only offer/default Casdoor SLO for OIDC-linked or OIDC-authenticated accounts
  const isOidcAccount = Boolean(
    user?.oidc_id || session?.login_method === 'oauth:oidc'
  )
  const [alsoSignOutSso, setAlsoSignOutSso] = useState(true)
  useEffect(() => {
    if (open) {
      setAlsoSignOutSso(isOidcAccount)
    }
  }, [open, isOidcAccount])
  const oidcDisplayName = status?.oidc_display_name?.trim() || 'OIDC'
  const unifiedLogoutUrl =
    oidcEnabled && isOidcAccount && typeof window !== 'undefined'
      ? buildUnifiedLogoutUrl(
          status?.oidc_authorization_endpoint,
          `${window.location.origin}/`,
          status?.oidc_client_id
        )
      : null

  const completeClientSignOut = () => {
    clearAuthenticatedClientState(queryClient)
    onOpenChange(false)
    if (alsoSignOutSso && unifiedLogoutUrl) {
      window.location.replace(unifiedLogoutUrl)
      return
    }
    toast.success(t('Signed out'))
    // CUSTOM(brand): return to public homepage after signing out
    void navigate({ to: '/', replace: true })
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      const response = await logout()
      if (!response.success) {
        handleServerError(response, t('Failed to sign out session'))
        return
      }
      completeClientSignOut()
    } catch (error: unknown) {
      const statusCode =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { status?: number } }).response
          ?.status === 'number'
          ? (error as { response?: { status?: number } }).response?.status
          : undefined
      if (statusCode === 401) {
        completeClientSignOut()
        return
      }
      handleServerError(error, t('Failed to sign out session'))
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Sign out')}
      desc={t(
        'Are you sure you want to sign out? You will need to sign in again to access your account.'
      )}
      confirmText={t('Sign out')}
      handleConfirm={handleSignOut}
      isLoading={isSigningOut}
      className='sm:max-w-sm'
    >
      {unifiedLogoutUrl && (
        <div className='space-y-1.5 pt-2'>
          <div className='flex items-center gap-2'>
            <Checkbox
              id='bozzii-slo-checkbox'
              checked={alsoSignOutSso}
              onCheckedChange={(checked) => setAlsoSignOutSso(checked === true)}
            />
            <Label
              htmlFor='bozzii-slo-checkbox'
              className='text-muted-foreground cursor-pointer text-xs font-normal'
            >
              {t('Also sign out of {{name}} (Unified Auth Center)', {
                name: oidcDisplayName,
              })}
            </Label>
          </div>
          {!alsoSignOutSso && (
            <p className='pl-6 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400'>
              {t(
                'Local sign-out only: {{name}} remains signed in, so clicking unified sign-in next time will auto-return to this account. Keep checked to switch accounts or on shared devices.',
                { name: oidcDisplayName }
              )}
            </p>
          )}
        </div>
      )}
    </ConfirmDialog>
  )
}
