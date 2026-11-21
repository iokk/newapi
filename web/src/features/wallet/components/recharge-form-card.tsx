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
import {
  ChevronDown, // CUSTOM(brand)
  ExternalLink,
  Gift,
  Loader2,
  Receipt,
  WalletCards,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { getBrandPresetMeta } from '@/branding/wallet' // CUSTOM(brand)
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  getDiscountLabel,
  getPaymentIcon,
  getMinTopupAmount,
  calculatePresetPricing,
} from '../lib'
import type {
  PaymentMethod,
  PresetAmount,
  TopupInfo,
  CreemProduct,
  WaffoPayMethod,
} from '../types'
import { CreemProductsSection } from './creem-products-section'

interface RechargeFormCardProps {
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  selectedPreset: number | null
  onSelectPreset: (preset: PresetAmount) => void
  topupAmount: number
  onTopupAmountChange: (amount: number) => void
  paymentAmount: number
  calculating: boolean
  onPaymentMethodSelect: (method: PaymentMethod) => void
  paymentLoading: string | null
  redemptionCode: string
  onRedemptionCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  topupLink?: string
  loading?: boolean
  priceRatio?: number
  usdExchangeRate?: number
  currencyPrefix?: string // CUSTOM(brand): optional display symbol (e.g. '¥') when site displays CNY
  collapseCustomAmount?: boolean // CUSTOM(brand): keep focus on fixed presets when enabled
  onOpenBilling?: () => void
  creemProducts?: CreemProduct[]
  enableCreemTopup?: boolean
  onCreemProductSelect?: (product: CreemProduct) => void
  enableWaffoTopup?: boolean
  waffoPayMethods?: WaffoPayMethod[]
  waffoMinTopup?: number
  onWaffoMethodSelect?: (method: WaffoPayMethod, index: number) => void
  enableWaffoPancakeTopup?: boolean
}

export function RechargeFormCard({
  topupInfo,
  presetAmounts,
  selectedPreset,
  onSelectPreset,
  topupAmount,
  onTopupAmountChange,
  paymentAmount,
  calculating,
  onPaymentMethodSelect,
  paymentLoading,
  redemptionCode,
  onRedemptionCodeChange,
  onRedeem,
  redeeming,
  topupLink,
  loading,
  priceRatio = 1,
  usdExchangeRate = 1,
  currencyPrefix = '',
  collapseCustomAmount = false,
  onOpenBilling,
  creemProducts,
  enableCreemTopup,
  onCreemProductSelect,
  enableWaffoTopup,
  waffoPayMethods,
  waffoMinTopup,
  onWaffoMethodSelect,
  enableWaffoPancakeTopup,
}: RechargeFormCardProps) {
  const { t } = useTranslation()
  const [localAmount, setLocalAmount] = useState(topupAmount.toString())
  const [showCustomAmount, setShowCustomAmount] = useState(
    !collapseCustomAmount
  )
  const withPrefix = (formatted: string) =>
    currencyPrefix ? `${currencyPrefix}${formatted}` : formatted

  useEffect(() => {
    // Empty string must survive, otherwise the field can never be cleared
    setLocalAmount((prev) =>
      prev === '' && topupAmount === 0 ? prev : topupAmount.toString()
    )
  }, [topupAmount])

  const handleAmountChange = (value: string) => {
    setLocalAmount(value)
    const numValue = Number.parseInt(value) || 0
    if (numValue >= 0) {
      onTopupAmountChange(numValue)
    }
  }

  const hasConfigurableTopup =
    topupInfo?.enable_online_topup ||
    topupInfo?.enable_stripe_topup ||
    enableWaffoTopup ||
    enableWaffoPancakeTopup
  const hasAnyTopup = hasConfigurableTopup || enableCreemTopup
  const hasStandardPaymentMethods =
    Array.isArray(topupInfo?.pay_methods) && topupInfo.pay_methods.length > 0
  const hasWaffoPaymentMethods =
    Array.isArray(waffoPayMethods) && waffoPayMethods.length > 0
  const minTopup = getMinTopupAmount(topupInfo)
  const redemptionEnabled = topupInfo?.enable_redemption !== false

  if (loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4 p-3 sm:space-y-6 sm:p-5'>
          <div className='space-y-4 sm:space-y-6'>
            {/* CUSTOM(brand): 3x2 preset skeleton matches fixed tiers layout */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-16' />
              <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3'>
                {Array.from({ length: 6 }, (_, index) => `preset-${index}`).map(
                  (key) => (
                    <Skeleton key={key} className='h-[76px] rounded-xl' />
                  )
                )}
              </div>
            </div>

            {/* Payment Methods Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-32' />
              <div className='flex flex-wrap gap-3'>
                {['primary', 'secondary', 'tertiary'].map((key) => (
                  <Skeleton key={key} className='h-10 w-24 rounded-lg' />
                ))}
              </div>
            </div>
          </div>

          {/* Redemption Code Section Skeleton */}
          <div className='space-y-3 border-t pt-8'>
            <Skeleton className='h-3 w-24' />
            <div className='flex gap-2'>
              <Skeleton className='h-10 flex-1' />
              <Skeleton className='h-10 w-20' />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <TitledCard
      title={t('Add Funds')}
      description={t('Choose an amount and payment method')}
      icon={<WalletCards className='h-4 w-4' />}
      iconTone='success'
      disableHoverEffect
      action={
        onOpenBilling ? (
          <Button
            variant='outline'
            size='sm'
            onClick={onOpenBilling}
            className='w-full gap-2 sm:w-auto'
          >
            <Receipt className='h-4 w-4' />
            {t('Order History')}
          </Button>
        ) : null
      }
      contentClassName='space-y-4 sm:space-y-6'
    >
      {/* Online Topup Section */}
      {hasAnyTopup ? (
        <div className='space-y-4 sm:space-y-6'>
          {hasConfigurableTopup && (
            <>
              {presetAmounts.length > 0 && (
                <div className='space-y-2.5'>
                  <div className='flex items-center justify-between gap-2'>
                    <Label className='text-muted-foreground text-xs font-medium'>
                      {t('Amount')}
                    </Label>
                    <button
                      type='button'
                      aria-expanded={showCustomAmount}
                      aria-controls='wallet-custom-amount-panel'
                      onClick={() => setShowCustomAmount((prev) => !prev)}
                      className='text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm text-xs transition-colors outline-none focus-visible:ring-2'
                    >
                      {t('Custom Amount')}
                      <ChevronDown
                        className={cn(
                          'size-3.5 transition-transform',
                          showCustomAmount && 'rotate-180'
                        )}
                        aria-hidden='true'
                      />
                    </button>
                  </div>
                  {/* CUSTOM(brand): 6 fixed integer-CNY tiers in clean 3x2 OpenAI-style grid */}
                  <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3'>
                    {presetAmounts.map((preset) => {
                      const discount =
                        preset.discount ||
                        topupInfo?.discount?.[preset.value] ||
                        1.0
                      const {
                        displayValue,
                        actualPrice,
                        savedAmount,
                        hasDiscount,
                      } = calculatePresetPricing(
                        preset.value,
                        priceRatio,
                        discount,
                        usdExchangeRate
                      )
                      const isSelected = selectedPreset === preset.value
                      const presetMeta = currencyPrefix
                        ? getBrandPresetMeta(preset.value)
                        : null
                      let badgeNode = null
                      if (hasDiscount) {
                        badgeNode = (
                          <div className='rounded-md bg-green-500/10 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400'>
                            {getDiscountLabel(discount, t)}
                          </div>
                        )
                      } else if (presetMeta) {
                        badgeNode = (
                          <div
                            className={cn(
                              'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                              presetMeta.highlight
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {presetMeta.label}
                          </div>
                        )
                      }
                      return (
                        <button
                          key={preset.value}
                          type='button'
                          aria-pressed={isSelected}
                          className={cn(
                            'group relative flex min-h-[76px] flex-col justify-between rounded-xl border px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isSelected
                              ? 'border-foreground bg-foreground/[0.04] ring-1 ring-foreground dark:bg-foreground/10'
                              : 'border-border/80 bg-background hover:border-foreground/40 hover:bg-muted/30'
                          )}
                          onClick={() => {
                            onSelectPreset(preset)
                            if (collapseCustomAmount) setShowCustomAmount(false)
                          }}
                        >
                          <div className='flex w-full items-center justify-between gap-2'>
                            <div className='text-foreground font-mono text-lg font-semibold tracking-tight tabular-nums'>
                              {withPrefix(formatNumber(displayValue))}
                            </div>
                            {badgeNode}
                          </div>
                          <div className='text-muted-foreground mt-1.5 text-xs tabular-nums'>
                            {hasDiscount && savedAmount > 0 ? (
                              <Trans
                                t={t}
                                i18nKey='Pay {{amount}} <savings>• Save {{saved}}</savings>'
                                values={{
                                  amount: withPrefix(
                                    formatCurrency(actualPrice)
                                  ),
                                  saved: withPrefix(
                                    formatCurrency(savedAmount)
                                  ),
                                }}
                                components={{
                                  savings: (
                                    <span className='text-green-600 dark:text-green-400' />
                                  ),
                                }}
                              />
                            ) : (
                              t('Pay {{amount}}', {
                                amount: withPrefix(formatCurrency(actualPrice)),
                              })
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* CUSTOM(brand): collapsible custom amount keeps focus on fixed tiers while preserving power-user input */}
              {(showCustomAmount || presetAmounts.length === 0) && (
                <div
                  id='wallet-custom-amount-panel'
                  className='bg-muted/25 space-y-2 rounded-xl border p-3'
                >
                  <Label
                    htmlFor='topup-amount'
                    className='text-muted-foreground text-xs font-medium'
                  >
                    {t('Custom Amount')}
                    {currencyPrefix && usdExchangeRate > 1
                      ? ` (USD · 1 USD = ${currencyPrefix}${usdExchangeRate})`
                      : ''}
                  </Label>
                  <Input
                    id='topup-amount'
                    name='topupAmount'
                    type='number'
                    inputMode='numeric'
                    autoComplete='off'
                    value={localAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    min={minTopup}
                    placeholder={t('Minimum {{amount}}', { amount: minTopup })}
                    className='bg-background h-9 font-mono text-sm tabular-nums'
                  />
                </div>
              )}

              <div className='space-y-2.5'>
                <div className='flex items-center justify-between gap-2'>
                  <Label className='text-muted-foreground text-xs font-medium'>
                    {t('Payment Method')}
                  </Label>
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    {t('Amount to pay:')}{' '}
                    <span className='text-foreground font-mono font-semibold'>
                      {calculating
                        ? '…'
                        : withPrefix(formatCurrency(paymentAmount))}
                    </span>
                  </span>
                </div>
                {hasStandardPaymentMethods ? (
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                    {topupInfo?.pay_methods?.map((method) => {
                      const methodMinTopup = Math.max(
                        method.min_topup || 0,
                        getMinTopupAmount(topupInfo)
                      )
                      const disabled = methodMinTopup > topupAmount
                      const minDisplay = currencyPrefix
                        ? withPrefix(
                            formatCurrency(methodMinTopup * priceRatio)
                          )
                        : String(methodMinTopup)
                      const disabledReason = disabled
                        ? t('Minimum topup amount: {{amount}}', {
                            amount: minDisplay,
                          })
                        : undefined
                      const disabledLabel = disabled
                        ? `${t('Minimum:')} ${minDisplay}`
                        : undefined

                      const button = (
                        <Button
                          key={method.type}
                          variant='outline'
                          onClick={() => onPaymentMethodSelect(method)}
                          disabled={disabled || !!paymentLoading}
                          title={disabledReason}
                          aria-label={
                            disabledReason
                              ? `${method.name}. ${disabledReason}`
                              : method.name
                          }
                          className={cn(
                            'h-12 min-w-0 justify-between rounded-xl px-4 text-left font-medium transition-colors',
                            !disabled &&
                              'hover:border-foreground/50 hover:bg-muted/40'
                          )}
                        >
                          <span className='flex min-w-0 items-center gap-2.5'>
                            {paymentLoading === method.type ? (
                              <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                              getPaymentIcon(
                                method.type,
                                'h-4 w-4 shrink-0',
                                method.icon,
                                method.name
                              )
                            )}
                            <span className='truncate text-sm'>
                              {method.name}
                            </span>
                          </span>
                          {disabledLabel ? (
                            <span className='text-muted-foreground shrink-0 text-[11px] font-normal tabular-nums'>
                              {disabledLabel}
                            </span>
                          ) : (
                            <span className='text-muted-foreground shrink-0 font-mono text-xs tabular-nums'>
                              {calculating
                                ? '…'
                                : withPrefix(formatCurrency(paymentAmount))}
                            </span>
                          )}
                        </Button>
                      )

                      return disabled ? (
                        <TooltipProvider key={method.type}>
                          <Tooltip>
                            <TooltipTrigger render={button} />
                            <TooltipContent>{disabledReason}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        button
                      )
                    })}
                  </div>
                ) : null}
                {!hasStandardPaymentMethods && !hasWaffoPaymentMethods && (
                  <Alert>
                    <AlertDescription>
                      {t(
                        'No payment methods available. Please contact administrator.'
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {enableWaffoTopup &&
                hasWaffoPaymentMethods &&
                onWaffoMethodSelect && (
                  <div className='space-y-2.5 sm:space-y-3'>
                    <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                      {t('Waffo Payment')}
                    </Label>
                    <div className='grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-3'>
                      {waffoPayMethods?.map((method, index) => {
                        const loadingKey = `waffo-${index}`
                        const methodKey = `${method.payMethodType ?? 'unknown'}-${method.payMethodName ?? method.name}`
                        const waffoMin = waffoMinTopup || 0
                        const belowMin = waffoMin > topupAmount
                        const disabledReason = belowMin
                          ? t('Minimum topup amount: {{amount}}', {
                              amount: waffoMin,
                            })
                          : undefined
                        const disabledLabel = belowMin
                          ? `${t('Minimum:')} ${waffoMin}`
                          : undefined

                        let methodIcon = getPaymentIcon('waffo')
                        if (paymentLoading === loadingKey) {
                          methodIcon = (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          )
                        } else if (method.icon) {
                          methodIcon = (
                            <img
                              src={method.icon}
                              alt={method.name}
                              className='h-4 w-4 object-contain'
                            />
                          )
                        }

                        const button = (
                          <Button
                            key={methodKey}
                            variant='outline'
                            onClick={() => onWaffoMethodSelect(method, index)}
                            disabled={belowMin || !!paymentLoading}
                            title={disabledReason}
                            aria-label={
                              disabledReason
                                ? `${method.name}. ${disabledReason}`
                                : method.name
                            }
                            className='min-h-14 min-w-0 justify-start gap-2 rounded-lg px-3 py-2 text-left'
                          >
                            {methodIcon}
                            <span className='flex min-w-0 flex-col items-start gap-0.5'>
                              <span className='max-w-full truncate'>
                                {method.name}
                              </span>
                              {disabledLabel && (
                                <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                  {disabledLabel}
                                </span>
                              )}
                            </span>
                          </Button>
                        )

                        return belowMin ? (
                          <TooltipProvider key={methodKey}>
                            <Tooltip>
                              <TooltipTrigger render={button} />
                              <TooltipContent>{disabledReason}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          button
                        )
                      })}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      ) : (
        <Alert>
          <AlertDescription>
            {t(
              'Online topup is not enabled. Please use redemption code or contact administrator.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Creem Products Section */}
      {enableCreemTopup &&
        Array.isArray(creemProducts) &&
        creemProducts.length > 0 &&
        onCreemProductSelect && (
          <div className='space-y-2.5 border-t pt-4 sm:space-y-3 sm:pt-6'>
            <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
              {t('Creem Payment')}
            </Label>
            <CreemProductsSection
              products={creemProducts}
              onProductSelect={onCreemProductSelect}
            />
          </div>
        )}

      {/* Redemption Code Section */}
      {redemptionEnabled ? (
        <div className='space-y-2.5 border-t pt-4 sm:pt-5'>
          <div className='flex items-center gap-1.5'>
            <Gift className='text-muted-foreground size-3.5' aria-hidden='true' />
            <Label
              htmlFor='redemption-code'
              className='text-muted-foreground text-xs font-medium'
            >
              {t('Have a Code?')}
            </Label>
          </div>
          <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
            <Input
              id='redemption-code'
              name='redemptionCode'
              autoComplete='off'
              spellCheck={false}
              value={redemptionCode}
              onChange={(e) => onRedemptionCodeChange(e.target.value)}
              placeholder={t('Enter your redemption code')}
              className='h-9 min-w-0'
            />
            <Button
              onClick={onRedeem}
              disabled={redeeming}
              variant='outline'
              className='h-9 px-4'
            >
              {redeeming && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('Redeem')}
            </Button>
          </div>
          {topupLink && (
            <p className='text-muted-foreground text-xs'>
              {t('Need a redemption code?')}{' '}
              <a
                href={topupLink}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
              >
                {t('Get one here')}
                <ExternalLink className='h-3 w-3' />
              </a>
            </p>
          )}
        </div>
      ) : (
        <Alert className='border-t'>
          <AlertDescription>
            {t(
              'Redemption codes are disabled until the administrator confirms compliance terms.'
            )}
          </AlertDescription>
        </Alert>
      )}
    </TitledCard>
  )
}
