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
import { LOG_TYPE_ENUM } from '@/features/usage-logs/constants'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import type { LogOtherData } from '@/features/usage-logs/types'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

export interface LogErrorDiagnosis {
  code: string
  title: string
  cause: string
  fixSteps: string[]
  retryable: boolean
  docHref: string
}

const DOC_BASE = 'https://doc.bozzii.com/guides'

/**
 * Determine whether a usage log represents a failed or abnormally interrupted request.
 */
export function isErrorUsageLog(
  log: Pick<UsageLog, 'type'>,
  other: LogOtherData | null
): boolean {
  if (log.type === LOG_TYPE_ENUM.ERROR) return true
  if (other?.stream_status?.end_reason === 'client_gone') return true
  if ((other?.stream_status?.error_count ?? 0) > 0) return true
  return false
}

function collectRawErrorText(
  log: Pick<UsageLog, 'content'>,
  other: LogOtherData | null
): string {
  return [
    log.content,
    other?.stream_status?.end_error,
    ...(other?.stream_status?.errors ?? []),
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' | ')
}

/**
 * Remove secrets, internal upstream URLs, IPv4/IPv6 addresses, and internal channel IDs
 * before a diagnostic report is copied to the user's clipboard.
 */
export function sanitizeDiagnosticText(raw: string): string {
  if (!raw) return ''
  return (
    raw
      // Auth headers & key-value secrets
      .replaceAll(
        /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
        '$1 [REDACTED_KEY]'
      )
      .replaceAll(
        /\b(x-api-key|api[-_]?key)\s*([:=])\s*["']?[A-Za-z0-9._~+/=-]{8,}["']?/gi,
        '$1$2[REDACTED_KEY]'
      )
      .replaceAll(
        /\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{16,}|xai-[A-Za-z0-9_-]{16,}|hf_[A-Za-z0-9]{16,})\b/g,
        '[REDACTED_KEY]'
      )
      // Non-bozzii upstream URLs (strict host boundary prevents api.bozzii.com.evil.com bypass)
      .replaceAll(
        /(?:https?|wss?|grpcs?):\/\/(?!(?:api|ai|doc|status)\.bozzii\.com(?:[:/?#]|$))[^\s"'<>)]+/gi,
        '[REDACTED_UPSTREAM]'
      )
      // Bracketed IPv6 addresses (e.g. [2606:4700:4700::1111]:443)
      .replaceAll(/\[[0-9a-f:]+\](?::\d+)?/gi, '[REDACTED_IP]')
      // Unbracketed IPv6 addresses containing :: (avoids matching HH:MM:SS timestamps)
      .replaceAll(
        /\b(?:[0-9a-f]{1,4}:){1,7}:[0-9a-f:]*\b/gi,
        '[REDACTED_IP]'
      )
      // Full 4+ group IPv6 addresses
      .replaceAll(
        /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi,
        '[REDACTED_IP]'
      )
      // Raw IPv4 addresses (with optional port)
      .replaceAll(
        /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d+)?\b/g,
        '[REDACTED_IP]'
      )
      // Internal channel identifiers (channel #46, channel_id=46, 渠道ID: 46)
      .replaceAll(
        /(?:channel(?:_?id)?|渠道\s*(?:id)?)\s*[:=#]?\s*\d+/gi,
        '[CHANNEL]'
      )
      .trim()
  )
}

function hasHttpCode(text: string, code: string): boolean {
  return new RegExp(`\\b${code}\\b`).test(text)
}

/**
 * Classify common gateway / upstream error strings into plain-language guidance
 * and actionable self-fix steps.
 */
export function diagnoseLogError(
  log: Pick<UsageLog, 'type' | 'content' | 'model_name' | 'is_stream'>,
  other: LogOtherData | null
): LogErrorDiagnosis {
  const text = collectRawErrorText(log, other).toLowerCase()

  if (other?.stream_status?.end_reason === 'client_gone') {
    return {
      code: 'CLIENT_DISCONNECTED',
      title: '流式传输中途客户端断开',
      cause: '客户端在模型生成完成前主动关闭了连接，可能由客户端读取超时过短引起。',
      fixSteps: [
        '将客户端流式读取超时调大至 120~300 秒，避免长思考阶段被客户端主动掐断。',
        '中断前已生成的 Token 按实际消耗结算，未生成部分不会扣费。',
      ],
      retryable: true,
      docHref: `${DOC_BASE}/streaming/`,
    }
  }

  if (
    hasHttpCode(text, '401') ||
    text.includes('invalid api key') ||
    text.includes('unauthorized') ||
    text.includes('无效的令牌') ||
    text.includes('invalid_token')
  ) {
    return {
      code: 'AUTH_401',
      title: '鉴权失败（401）',
      cause: 'API 令牌无效、格式未以 sk- 开头、已过期或已被禁用。',
      fixSteps: [
        '前往「API 密钥」确认令牌状态正常且未过期。',
        'OpenAI 协议使用 Authorization: Bearer sk-...，Anthropic 协议使用 x-api-key: sk-...。',
      ],
      retryable: false,
      docHref: `${DOC_BASE}/base-url-auth/`,
    }
  }

  if (
    text.includes('insufficient') ||
    text.includes('quota') ||
    text.includes('balance') ||
    text.includes('余额不足') ||
    text.includes('额度不足') ||
    text.includes('无权访问') ||
    hasHttpCode(text, '402') ||
    hasHttpCode(text, '403')
  ) {
    return {
      code: 'PERMISSION_OR_QUOTA',
      title: '余额不足或模型权限受限（402 / 403）',
      cause: '账户或令牌剩余额度不足、当前令牌未勾选该模型，或默认 User-Agent 被边缘防护拦截。',
      fixSteps: [
        '检查账户剩余额度及「API 密钥」中该 Key 的额度上限与模型白名单。',
        '若使用 Python urllib 等脚本直连，请改用官方 SDK 或显式设置标准 User-Agent。',
      ],
      retryable: false,
      docHref: `${DOC_BASE}/errors/`,
    }
  }

  if (
    hasHttpCode(text, '429') ||
    text.includes('rate limit') ||
    text.includes('too many requests') ||
    text.includes('频率')
  ) {
    return {
      code: 'RATE_LIMIT_429',
      title: '请求频率受限（429）',
      cause: '短时间并发过高，触发单账户限流（默认 1,000 成功 RPM / 2,000 总 RPM）或上游瞬时限流。',
      fixSteps: [
        '在业务侧使用指数退避 + 随机抖动重试（最多 3 次），并用队列控制突发并发。',
        '如需更高并发配额，请联系客服评估企业专属扩容。',
      ],
      retryable: true,
      docHref: `${DOC_BASE}/retry/`,
    }
  }

  if (
    hasHttpCode(text, '524') ||
    hasHttpCode(text, '504') ||
    text.includes('timeout') ||
    text.includes('deadline exceeded') ||
    text.includes('超时')
  ) {
    return {
      code: 'TIMEOUT_524',
      title: '请求超时（504 / 524）',
      cause: log.is_stream
        ? '上游模型响应耗时过长，超过流式等待上限（空闲 300s / 总时长 600s）。'
        : '非流式请求超过网关 120 秒上限，常见于长文本生成或复杂推理任务。',
      fixSteps: [
        '长文本与推理任务请务必开启 stream: true（网关每 10 秒发送 : PING 保活，支持长达 600 秒）。',
        '首 Token 前超时报错不扣费，可直接退避重试。',
      ],
      retryable: true,
      docHref: `${DOC_BASE}/streaming/`,
    }
  }

  if (
    hasHttpCode(text, '413') ||
    text.includes('too large') ||
    text.includes('payload')
  ) {
    return {
      code: 'PAYLOAD_413',
      title: '请求体过大（413）',
      cause: '单次 HTTP 请求体超过 100 MB 上限（常见于多张未压缩 Base64 图片）。',
      fixSteps: [
        '压缩图片分辨率/体积（建议单张 < 20 MB）或改用公开 HTTPS 图片链接传入。',
      ],
      retryable: false,
      docHref: `${DOC_BASE}/vision/`,
    }
  }

  if (
    hasHttpCode(text, '404') ||
    text.includes('not found') ||
    text.includes('model_not_found')
  ) {
    return {
      code: 'NOT_FOUND_404',
      title: '模型或接口路径不存在（404）',
      cause: 'Base URL 拼接错误（如 Anthropic 多加了 /v1）或调用了未上线/已下线模型。',
      fixSteps: [
        '核对 Base URL：OpenAI SDK 填 https://api.bozzii.com/v1，Anthropic / Claude Code 填 https://api.bozzii.com（不带 /v1）。',
        '调用 GET /v1/models 核对当前可用模型 ID。',
      ],
      retryable: false,
      docHref: `${DOC_BASE}/base-url-auth/`,
    }
  }

  if (
    hasHttpCode(text, '400') ||
    text.includes('invalid_request') ||
    text.includes('adaptive') ||
    text.includes('max_tokens') ||
    text.includes('context_length') ||
    text.includes('bad request')
  ) {
    return {
      code: 'BAD_REQUEST_400',
      title: '请求参数不合法（400）',
      cause: '缺少必填字段、参数取值与目标模型协议不兼容，或上下文长度超出模型上限。',
      fixSteps: [
        'Anthropic /v1/messages 必须传 max_tokens；推理模型建议 max_tokens >= 256。',
        'claude-opus-5-5 思考模式请使用 thinking: { type: "adaptive" } + output_config.effort。',
        '首 Token 前 400 报错实扣 ¥0，修正参数后重新发起即可。',
      ],
      retryable: false,
      docHref: `${DOC_BASE}/errors/`,
    }
  }

  if (
    hasHttpCode(text, '503') ||
    hasHttpCode(text, '502') ||
    hasHttpCode(text, '500') ||
    text.includes('no available channel') ||
    text.includes('overloaded') ||
    text.includes('无可用渠道')
  ) {
    return {
      code: 'UPSTREAM_5XX',
      title: '上游服务临时异常（500 / 502 / 503）',
      cause: '目标模型上游节点瞬时拥塞、临时维护，或当前协议与该模型不兼容。',
      fixSteps: [
        '若在 /v1/messages 调用 deepseek-* 报 500，请改用 /v1/chat/completions 或 /v1/responses。',
        '偶发 502/503 首 Token 前失败实扣 ¥0，建议指数退避重试或切换备选模型。',
      ],
      retryable: true,
      docHref: `${DOC_BASE}/retry/`,
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    title: '请求执行异常',
    cause: '请求未按预期完成，可参考下方错误原文或一键复制脱敏排障摘要联系客服定位。',
    fixSteps: [
      '先对照「常见错误与排查」文档核对 Base URL、模型名与必填参数。',
      '点击「一键复制排障摘要」，通过「联系客服」发给技术人员快速检索链路。',
    ],
    retryable: true,
    docHref: `${DOC_BASE}/errors/`,
  }
}

/**
 * Build a customer-safe, strictly sanitized diagnostic report suitable for pasting
 * into WeChat / Feishu / Email support channels.
 */
export function buildSanitizedDiagnosticReport(
  log: Pick<
    UsageLog,
    | 'id'
    | 'request_id'
    | 'created_at'
    | 'model_name'
    | 'is_stream'
    | 'use_time'
    | 'quota'
    | 'content'
    | 'type'
  >,
  other: LogOtherData | null
): string {
  const diagnosis = diagnoseLogError(log, other)
  const sanitizedError = sanitizeDiagnosticText(
    collectRawErrorText(log, other)
  ).slice(0, 400)
  const costText =
    log.quota === 0 ? '¥0（未扣费）' : formatLogQuota(log.quota)
  const lines = [
    '[Bozzii AI 排障摘要]',
    `Request ID: ${log.request_id || `log-${log.id}`}`,
    `时间: ${formatTimestampToDate(log.created_at)}`,
    `模型: ${log.model_name || '-'}`,
    `模式: ${log.is_stream ? '流式 (SSE)' : '非流式'}`,
    `耗时: ${log.use_time ?? 0}s`,
    `扣费: ${costText}`,
    `初步分类: ${diagnosis.title} (${diagnosis.code})`,
    `错误摘要: ${sanitizedError || '-'}`,
  ]
  return lines.join('\n')
}
