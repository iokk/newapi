/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import type { QuotaDataItem } from '@/features/dashboard/types'
import type { UserSubscriptionRecord } from '@/features/subscriptions/types'

import {
  buildDailyTrendPoints,
  buildOverviewCurlSnippet,
  isColdStartUser,
  normalizeOverviewBaseUrl,
  pickOverviewExampleModel,
  resolveAccountHealthState,
  summarizeActiveSubscriptions,
} from '../overview-helpers'

describe('brand overview helpers', () => {
  it('picks flagship Bozzii model instead of alphabetical niche model like grok-4.6', () => {
    expect(
      pickOverviewExampleModel(['grok-4.6', 'glm-5.3', 'deepseek-v4.1-flash'])
    ).toBe('deepseek-v4.1-flash')
    expect(pickOverviewExampleModel(['grok-4.6', 'glm-5.3'])).toBe('glm-5.3')
    expect(pickOverviewExampleModel(['custom-model'])).toBe('custom-model')
    expect(pickOverviewExampleModel([])).toBe('deepseek-v4.1-flash')
  })

  it('aggregates active non-expired subscriptions and treats active subscription with zero wallet as healthy', () => {
    const nowSec = 1_795_300_000
    const records = [
      {
        subscription: {
          id: 1,
          plan_id: 4,
          status: 'active',
          amount_total: 1_780_822,
          amount_used: 356_164,
          end_time: nowSec + 29 * 86400,
        },
      },
      {
        subscription: {
          id: 2,
          plan_id: 5,
          status: 'active',
          amount_total: 500_000,
          amount_used: 0,
          end_time: nowSec - 10, // expired -> ignored
        },
      },
    ] as unknown as UserSubscriptionRecord[]

    const summary = summarizeActiveSubscriptions(records, nowSec)
    expect(summary.activeCount).toBe(1)
    expect(summary.remainQuota).toBe(1_780_822 - 356_164)
    expect(summary.usagePercent).toBe(20)
    expect(summary.minRemainDays).toBe(29)

    expect(
      resolveAccountHealthState({
        walletQuota: 0,
        activeSubRemainQuota: summary.remainQuota,
        hasUnlimitedSub: false,
        recent24hUsage: 100_000,
      })
    ).toBe('healthy')

    expect(
      resolveAccountHealthState({
        walletQuota: 0,
        activeSubRemainQuota: 0,
        hasUnlimitedSub: false,
        recent24hUsage: 0,
      })
    ).toBe('depleted')
  })

  it('classifies cold-start vs active users accurately', () => {
    expect(
      isColdStartUser({
        keyCount: 0,
        requestCount: 0,
        walletQuota: 0,
        activeSubCount: 0,
      })
    ).toBe(true)
    expect(
      isColdStartUser({
        keyCount: 1,
        requestCount: 0,
        walletQuota: 0,
        activeSubCount: 1,
      })
    ).toBe(false)
    expect(
      isColdStartUser({
        keyCount: 0,
        requestCount: 12,
        walletQuota: 0,
        activeSubCount: 0,
      })
    ).toBe(false)
  })

  it('buckets 7-day trend points and builds clean curl snippet', () => {
    const nowSec = Math.floor(new Date(2026, 10, 22, 12, 0, 0).getTime() / 1000)
    const rows = [
      { created_at: nowSec - 3600, quota: 500_000, count: 12 },
      { created_at: nowSec - 2 * 86400, quota: 250_000, count: 5 },
    ] as unknown as QuotaDataItem[]

    const pts = buildDailyTrendPoints(rows, 7, nowSec)
    expect(pts).toHaveLength(7)
    expect(pts[6].quota).toBe(500_000)
    expect(pts[6].requests).toBe(12)
    expect(pts[4].quota).toBe(250_000)

    expect(normalizeOverviewBaseUrl('https://api.bozzii.com/v1/')).toBe(
      'https://api.bozzii.com'
    )
    const curl = buildOverviewCurlSnippet({
      baseUrl: 'https://api.bozzii.com/',
      apiKey: 'sk-test',
      model: 'deepseek-v4.1-flash',
    })
    expect(curl).toContain('https://api.bozzii.com/v1/chat/completions')
    expect(curl).toContain('"model":"deepseek-v4.1-flash"')
  })
})
