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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PricingTable } from '../components/pricing-table'
import type { PricingModel } from '../types'

const model: PricingModel = {
  id: 1,
  model_name: 'gpt-4o',
  vendor_name: 'OpenAI',
  quota_type: 0,
  model_ratio: 1.25,
  completion_ratio: 4,
  enable_groups: ['default', 'vip'],
}

describe('pricing sheet', () => {
  it('shows models in a bordered grid with a frozen header and name column', () => {
    render(<PricingTable models={[model]} />)

    const modelHeader = screen.getByRole('columnheader', { name: 'Model' })
    expect(modelHeader).toHaveClass('border-r', 'sticky')
    expect(modelHeader.closest('thead')).toHaveClass('sticky')
    expect(modelHeader.closest('table')?.parentElement).toHaveClass(
      'overflow-auto'
    )
    expect(screen.getByRole('columnheader', { name: 'Price' })).toHaveClass(
      'border-r'
    )
    expect(
      screen.queryByRole('columnheader', { name: 'Endpoints' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: 'Tags' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'OpenAI' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Token-based' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'default, vip' })).toBeVisible()
    expect(screen.getByText('gpt-4o')).toBeVisible()
  })
})
