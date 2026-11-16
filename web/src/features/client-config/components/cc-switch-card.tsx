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
import { useMutation } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CCSwitchDialog } from '@/features/keys/components/dialogs/cc-switch-dialog'
import { handleServerError } from '@/lib/handle-server-error'

import { getClientConfigKey } from '../api'
import { CLIENT_PRODUCTS } from '../lib/prompt'

type CCSwitchCardProps = {
  target: 'claude' | 'codex'
  tokenId: number
}

export function CCSwitchCard(props: CCSwitchCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [tokenKey, setTokenKey] = useState('')
  const importMutation = useMutation({
    mutationFn: () => getClientConfigKey(props.target, props.tokenId),
    onSuccess: (key) => {
      setTokenKey(key)
      setOpen(true)
    },
    onError: (error) => handleServerError(error),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Import to CC Switch')}</CardTitle>
        <CardDescription>
          {t('Configure {{product}} with the selected API key.', {
            product: CLIENT_PRODUCTS[props.target],
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant='outline'
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
        >
          <Link2 />
          {t('Open CC Switch')}
        </Button>
      </CardContent>
      <CCSwitchDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setTokenKey('')
        }}
        tokenKey={tokenKey}
        initialApp={props.target}
      />
    </Card>
  )
}
