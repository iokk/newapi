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
import { useState } from 'react'
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

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status } = useStatus()
  const [isSigningOut, setIsSigningOut] = useState(false)
  // CUSTOM(brand): default to RP-Initiated Single Logout so users can cleanly switch unified accounts
  const [alsoSignOutSso, setAlsoSignOutSso] = useState(true)
  const oidcEnabled = Boolean(status?.oidc_enabled)
  const oidcDisplayName = status?.oidc_display_name?.trim() || 'OIDC'
  const unifiedLogoutUrl =
    oidcEnabled && typeof window !== 'undefined'
      ? buildUnifiedLogoutUrl(
          status?.oidc_authorization_endpoint,
          `${window.location.origin}/sign-in`
        )
      : null

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      const response = await logout()
      if (!response.success) {
        handleServerError(response, t('Failed to sign out session'))
        return
      }

      clearAuthenticatedClientState(queryClient)
      toast.success(t('Signed out'))
      if (alsoSignOutSso && unifiedLogoutUrl) {
        window.location.assign(unifiedLogoutUrl)
        return
      }
      void navigate({ to: '/sign-in', replace: true })
    } catch (error: unknown) {
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
        <div className='flex items-center gap-2 pt-2'>
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
      )}
    </ConfirmDialog>
  )
}
