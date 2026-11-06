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
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { getLobeIcon } from '@/lib/lobe-icon'

import { getBillingModeLabelKey } from '../lib/billing-mode'
import type { PricingModel } from '../types'
import { CachedPriceCell } from './cached-price-cell'
import { ModelPriceCell, type ModelPriceCellOptions } from './model-price-cell'

// ----------------------------------------------------------------------------
// Pricing Table Columns
// ----------------------------------------------------------------------------

export type PricingColumnsOptions = ModelPriceCellOptions

export function usePricingColumns(
  options: PricingColumnsOptions = {}
): ColumnDef<PricingModel>[] {
  const { t } = useTranslation()

  return [
    // Model column
    {
      accessorKey: 'model_name',
      meta: { label: t('Model') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Model')} />
      ),
      cell: ({ row }) => {
        const model = row.original
        const modelIconKey = model.icon || model.vendor_icon
        const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 14) : null

        return (
          <div className='flex max-w-full min-w-0 items-center gap-2'>
            {modelIcon}
            <span className='truncate font-mono text-sm font-medium'>
              {model.model_name}
            </span>
          </div>
        )
      },
      minSize: 200,
    },

    // Type column
    {
      accessorKey: 'quota_type',
      header: t('Type'),
      cell: ({ row }) => t(getBillingModeLabelKey(row.original)),
      size: 110,
      enableSorting: false,
    },

    // Price column
    {
      accessorKey: 'price',
      meta: { label: t('Price') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Price')} />
      ),
      cell: ({ row }) => (
        <ModelPriceCell model={row.original} options={options} />
      ),
      size: 180,
      enableSorting: false,
    },

    // Cached price column (Vercel AI Gateway style)
    {
      id: 'cached_price',
      header: t('Cached'),
      cell: ({ row }) => (
        <CachedPriceCell model={row.original} options={options} />
      ),
      size: 110,
      enableSorting: false,
    },

    {
      accessorKey: 'vendor_name',
      header: t('Vendor'),
      cell: ({ row }) => row.original.vendor_name || '—',
      size: 120,
      enableSorting: false,
    },
    {
      accessorKey: 'enable_groups',
      header: t('Groups'),
      cell: ({ row }) => {
        const groups = row.original.enable_groups || []
        return groups.length > 0 ? groups.join(', ') : '—'
      },
      size: 140,
      enableSorting: false,
    },
  ]
}
