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
import { describe, expect, it } from 'vitest'

import {
  buildSanitizedDiagnosticReport,
  diagnoseLogError,
  isErrorUsageLog,
  sanitizeDiagnosticText,
} from '../log-diagnostics'

describe('log-diagnostics', () => {
  it('detects error and client_gone logs without flagging normal consume logs', () => {
    expect(isErrorUsageLog({ type: 2 }, null)).toBe(false)
    expect(isErrorUsageLog({ type: 5 }, null)).toBe(true)
    expect(
      isErrorUsageLog(
        { type: 2 },
        { stream_status: { end_reason: 'client_gone' } }
      )
    ).toBe(true)
    expect(
      isErrorUsageLog({ type: 2 }, { stream_status: { error_count: 1 } })
    ).toBe(true)
  })

  it('strips secrets, spoofed/upstream URLs, IPv4/IPv6, and channel IDs while preserving bozzii domains and timestamps', () => {
    const raw =
      '12:34:56 channel_id=46 渠道ID: 12 wss://secret.internal/ws https://api.bozzii.com.evil.com/v1 https://api.bozzii.com@leak.io/x [2606:4700:4700::1111]:443 2001:db8::1 23.19.228.138:8080 x-api-key: sec_header_9999 Bearer tok_secret123= sk-liveSecretKey987654 AIzaSyDummySecretKey1234567890 ok https://api.bozzii.com/v1'
    const cleaned = sanitizeDiagnosticText(raw)

    expect(cleaned).not.toContain('sk-liveSecretKey987654')
    expect(cleaned).not.toContain('tok_secret123')
    expect(cleaned).not.toContain('sec_header_9999')
    expect(cleaned).not.toContain('AIzaSyDummySecretKey1234567890')
    expect(cleaned).not.toContain('secret.internal')
    expect(cleaned).not.toContain('evil.com')
    expect(cleaned).not.toContain('leak.io')
    expect(cleaned).not.toContain('2606:4700')
    expect(cleaned).not.toContain('2001:db8')
    expect(cleaned).not.toContain('23.19.228.138')
    expect(cleaned).not.toContain('46')
    expect(cleaned).not.toContain('渠道ID: 12')
    expect(cleaned).toContain('12:34:56')
    expect(cleaned).toContain('https://api.bozzii.com/v1')
  })

  it('classifies common gateway errors accurately without numeric substring false positives', () => {
    expect(
      diagnoseLogError(
        {
          type: 5,
          content: 'requested 140123 tokens exceeds window',
          model_name: 'gpt-6.2-sol',
          is_stream: false,
        },
        null
      ).code
    ).toBe('UNKNOWN_ERROR')

    expect(
      diagnoseLogError(
        {
          type: 5,
          content: 'HTTP 401 unauthorized invalid api key',
          model_name: 'gpt-6.2-sol',
          is_stream: false,
        },
        null
      ).code
    ).toBe('AUTH_401')

    expect(
      diagnoseLogError(
        {
          type: 5,
          content: '429 rate limit exceeded',
          model_name: 'deepseek-v4.1-flash',
          is_stream: true,
        },
        null
      )
    ).toMatchObject({ code: 'RATE_LIMIT_429', retryable: true })

    expect(
      diagnoseLogError(
        {
          type: 5,
          content: '524 gateway timeout',
          model_name: 'claude-opus-5-5',
          is_stream: false,
        },
        null
      )
    ).toMatchObject({ code: 'TIMEOUT_524', retryable: true })

    expect(
      diagnoseLogError(
        {
          type: 2,
          content: '',
          model_name: 'claude-sonnet-5-5',
          is_stream: true,
        },
        {
          stream_status: {
            error_count: 1,
            end_error: '502 bad gateway from upstream',
          },
        }
      ).code
    ).toBe('UPSTREAM_5XX')
  })

  it('builds a customer-safe diagnostic report including stream end_error fallback', () => {
    const report = buildSanitizedDiagnosticReport(
      {
        id: 57375,
        request_id: '20261122011234abcd',
        created_at: 1795280000,
        model_name: 'gpt-6.2-sol',
        is_stream: false,
        use_time: 1,
        quota: 0,
        type: 5,
        content:
          '503 no available channel #40 at https://upstream-hidden.io/v1 with sk-abc123456789',
      },
      null
    )

    expect(report).toContain('[Bozzii AI 排障摘要]')
    expect(report).toContain('Request ID: 20261122011234abcd')
    expect(report).toContain('模型: gpt-6.2-sol')
    expect(report).toContain('扣费: ¥0（未扣费）')
    expect(report).not.toContain('upstream-hidden.io')
    expect(report).not.toContain('sk-abc123456789')
    expect(report).not.toContain('#40')
  })
})
