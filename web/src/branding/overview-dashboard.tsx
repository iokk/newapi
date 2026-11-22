/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Terminal,
  X,
  Zap,
} from 'lucide-react'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { AnnouncementDetailModal } from '@/features/dashboard/components/overview/announcement-detail-dialog'
import { PerformanceHealthPanel } from '@/features/dashboard/components/overview/performance-health-panel'
import { UptimePanel } from '@/features/dashboard/components/overview/uptime-panel'
import {
  useAnnouncements,
  useApiInfo,
  useDashboardContentVisibility,
} from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import {
  getDefaultPingStatus,
  getLatencyColorClass,
  testUrlLatency,
} from '@/features/dashboard/lib/api-info'
import type { AnnouncementItem, PingStatus } from '@/features/dashboard/types'
import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { getSelfSubscriptionFull } from '@/features/subscriptions/api'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { getUserModels } from '@/lib/api'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatNumber, formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  type AccountHealthState,
  buildDailyTrendPoints,
  buildOverviewCurlSnippet,
  isColdStartUser,
  normalizeOverviewBaseUrl,
  pickOverviewExampleModel,
  resolveAccountHealthState,
  summarizeActiveSubscriptions,
} from './overview-helpers'

const DISMISSED_ANNOUNCEMENT_KEY = 'bozzii_dismissed_announcement_id'
const SETUP_GUIDE_OVERRIDE_KEY = 'bozzii_overview_setup_guide_override'
const EMPTY_KEYS: ApiKey[] = []

function getSavedDismissedAnnouncementId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY)
}

function getSavedSetupOverride(): boolean | null {
  if (typeof window === 'undefined') return null
  const val = window.localStorage.getItem(SETUP_GUIDE_OVERRIDE_KEY)
  if (val === 'open') return true
  if (val === 'closed') return false
  return null
}

function maskKeyForPreview(rawKey?: string): string {
  if (!rawKey) return 'sk-...'
  const full = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`
  if (full.length <= 14) return full
  return `${full.slice(0, 7)}...${full.slice(-4)}`
}

const HEALTH_META: Record<
  AccountHealthState,
  { dotClass: string; label: string; textClass: string }
> = {
  healthy: {
    dotClass: 'bg-emerald-500',
    label: '额度充足',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  low: {
    dotClass: 'bg-amber-500',
    label: '余额偏低',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  depleted: {
    dotClass: 'bg-destructive',
    label: '余额已耗尽',
    textClass: 'text-destructive',
  },
}

/**
 * Scheme A (Linear / Vercel Dual-State Minimalist Workspace):
 * - Top 1-line dismissible announcement strip (opens native AnnouncementDetailModal)
 * - Cold-start mode: compact 2-col 3-step launchpad + flagship model curl + 4-col status bar
 * - Active mode: unified Subscription + Wallet + Usage strip -> 1-line Base URL readiness bar -> clean 7-day monochrome trend chart
 * - FAQ & historical announcements live cleanly inside /contact tabs (zero overview clutter)
 */
export function BrandOverviewDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  const isWalletVisible = useIsSidebarModuleVisible('/wallet')
  const {
    announcements: showAnnouncementsPanel,
    uptimeKuma: showUptimePanel,
  } = useDashboardContentVisibility()
  const { items: announcements } = useAnnouncements()
  const { items: apiInfoItems } = useApiInfo()
  const { copyToClipboard } = useCopyToClipboard({ notify: false })

  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState<
    string | null
  >(() => getSavedDismissedAnnouncementId())
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false)
  const [manualSetupGuide, setManualSetupGuide] = useState<boolean | null>(() =>
    getSavedSetupOverride()
  )
  const [pingStatus, setPingStatus] = useState<PingStatus>(getDefaultPingStatus)
  const [copyingCurl, setCopyingCurl] = useState(false)
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null)

  const sevenDayRange = useMemo(() => computeTimeRange(7), [])

  const apiKeysQuery = useQuery({
    queryKey: ['brand-overview', 'keys', user?.id ?? 0],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const res = requireServerSuccess(await getApiKeys({ p: 1, size: 10 }))
      return (res.data?.items ?? []) as ApiKey[]
    },
    staleTime: 60_000,
  })

  const modelsQuery = useQuery({
    queryKey: ['brand-overview', 'models', user?.id ?? 0],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const res = requireServerSuccess(await getUserModels())
      return (res.data ?? []) as string[]
    },
    staleTime: 300_000,
  })

  const subscriptionQuery = useQuery({
    queryKey: ['brand-overview', 'subscriptions', user?.id ?? 0],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const res = requireServerSuccess(await getSelfSubscriptionFull())
      return res.data?.subscriptions ?? []
    },
    staleTime: 60_000,
  })

  const trendQuery = useQuery({
    queryKey: [
      'brand-overview',
      'trend-7d',
      user?.id ?? 0,
      sevenDayRange.start_timestamp,
      sevenDayRange.end_timestamp,
    ],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const res = requireServerSuccess(
        await getUserQuotaDates(
          {
            start_timestamp: sevenDayRange.start_timestamp,
            end_timestamp: sevenDayRange.end_timestamp,
            default_time: 'day',
          },
          false
        )
      )
      return res.data ?? []
    },
    staleTime: 60_000,
  })

  const keys = apiKeysQuery.data ?? EMPTY_KEYS
  const activeKeyCount = useMemo(
    () => keys.filter((k) => k.status === 1).length,
    [keys]
  )
  const preferredKey = useMemo(
    () => keys.find((k) => k.status === 1) ?? keys[0] ?? null,
    [keys]
  )

  const subSummary = useMemo(
    () => summarizeActiveSubscriptions(subscriptionQuery.data ?? []),
    [subscriptionQuery.data]
  )

  const walletQuota = Number(user?.quota ?? 0)
  const totalUsedQuota = Number(user?.used_quota ?? 0)
  const totalRequests = Number(user?.request_count ?? 0)

  const trendPoints = useMemo(
    () => buildDailyTrendPoints(trendQuery.data ?? [], 7),
    [trendQuery.data]
  )
  const recent24hUsage = trendPoints.at(-1)?.quota ?? 0
  const sevenDayQuotaTotal = useMemo(
    () => trendPoints.reduce((sum, pt) => sum + pt.quota, 0),
    [trendPoints]
  )
  const sevenDayRequestTotal = useMemo(
    () => trendPoints.reduce((sum, pt) => sum + pt.requests, 0),
    [trendPoints]
  )
  const maxTrendQuota = useMemo(
    () => Math.max(0, ...trendPoints.map((pt) => pt.quota)),
    [trendPoints]
  )

  const healthState = useMemo(
    () =>
      resolveAccountHealthState({
        walletQuota,
        activeSubRemainQuota: subSummary.remainQuota,
        hasUnlimitedSub: subSummary.hasUnlimited,
        recent24hUsage,
      }),
    [
      walletQuota,
      subSummary.remainQuota,
      subSummary.hasUnlimited,
      recent24hUsage,
    ]
  )
  const healthMeta = HEALTH_META[healthState]

  const coldStart = isColdStartUser({
    keyCount: keys.length,
    requestCount: totalRequests,
    walletQuota,
    activeSubCount: subSummary.activeCount,
  })

  const setupStatusReady =
    apiKeysQuery.isFetched && subscriptionQuery.isFetched && Boolean(user)
  const showSetupGuide =
    manualSetupGuide ?? (setupStatusReady ? coldStart : false)

  const toggleSetupGuide = useCallback((next: boolean) => {
    setManualSetupGuide(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        SETUP_GUIDE_OVERRIDE_KEY,
        next ? 'open' : 'closed'
      )
    }
  }, [])

  const primaryApiInfo = apiInfoItems[0]
  const baseUrl = normalizeOverviewBaseUrl(primaryApiInfo?.url)
  const exampleModel = useMemo(
    () => pickOverviewExampleModel(modelsQuery.data),
    [modelsQuery.data]
  )

  const curlDisplay = useMemo(
    () =>
      buildOverviewCurlSnippet({
        baseUrl,
        apiKey: maskKeyForPreview(preferredKey?.key),
        model: exampleModel,
      }),
    [baseUrl, preferredKey?.key, exampleModel]
  )

  const handleCopyCurl = useCallback(async () => {
    setCopyingCurl(true)
    try {
      let resolvedKey = 'sk-your-api-key'
      if (preferredKey?.id) {
        const keyRes = await fetchTokenKey(preferredKey.id)
        if (keyRes.success && keyRes.data?.key) {
          resolvedKey = keyRes.data.key.startsWith('sk-')
            ? keyRes.data.key
            : `sk-${keyRes.data.key}`
        }
      }
      const cmd = buildOverviewCurlSnippet({
        baseUrl,
        apiKey: resolvedKey,
        model: exampleModel,
      })
      await copyToClipboard(cmd)
      toast.success(t('Copied to clipboard'))
    } catch (error) {
      handleServerError(error, t('Copy failed'))
    } finally {
      setCopyingCurl(false)
    }
  }, [baseUrl, copyToClipboard, exampleModel, preferredKey?.id, t])

  const handleTestLatency = useCallback(async () => {
    setPingStatus({ latency: null, testing: true, error: false })
    const result = await testUrlLatency(baseUrl)
    setPingStatus(result)
  }, [baseUrl])

  const latestAnnouncement = announcements[0] ?? null
  const latestAnnouncementKey = latestAnnouncement
    ? String(
        latestAnnouncement.id ??
          latestAnnouncement.publishDate ??
          latestAnnouncement.content.slice(0, 32)
      )
    : null
  const showAnnouncementStrip = Boolean(
    showAnnouncementsPanel &&
      latestAnnouncement &&
      latestAnnouncementKey &&
      dismissedAnnouncementId !== latestAnnouncementKey
  )

  const handleDismissAnnouncement = () => {
    if (!latestAnnouncementKey) return
    setDismissedAnnouncementId(latestAnnouncementKey)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        DISMISSED_ANNOUNCEMENT_KEY,
        latestAnnouncementKey
      )
    }
  }

  const onboardingSteps = [
    {
      index: 1,
      title: '创建 API 密钥',
      description: '为应用或本地工具生成独立访问凭证',
      completed: keys.length > 0,
      to: '/keys' as const,
      cta: keys.length > 0 ? '管理密钥' : '去创建',
    },
    {
      index: 2,
      title: isWalletVisible ? '开通 ¥19.9 体验包或充值' : '获取测试额度',
      description: isWalletVisible
        ? '个人首单 ¥19.9 得 ¥26（加赠 30%），或按量充值'
        : '联系专属团队领取试用额度或办理企业对公',
      completed: walletQuota > 0 || subSummary.activeCount > 0,
      to: (isWalletVisible ? '/wallet' : '/contact') as '/wallet' | '/contact',
      cta: isWalletVisible ? '去钱包' : '联系客服',
    },
    {
      index: 3,
      title: '一键配置客户端或发起调用',
      description: '自动生成 WorkBuddy、Claude Code、Codex 配置',
      completed: totalRequests > 0,
      to: '/client-config' as const,
      cta: '去配置',
    },
  ]
  const completedSteps = onboardingSteps.filter((s) => s.completed).length

  const activeHoveredDay =
    hoveredDayIndex !== null ? trendPoints[hoveredDayIndex] : null

  let pingLabel: ReactNode = '测速'
  if (pingStatus.testing) {
    pingLabel = '测速中…'
  } else if (pingStatus.latency !== null) {
    pingLabel = (
      <span
        className={cn(
          'font-mono font-medium',
          getLatencyColorClass(pingStatus.latency)
        )}
      >
        {pingStatus.latency}ms
      </span>
    )
  } else if (pingStatus.error) {
    pingLabel = '不可达'
  }

  let subscriptionBody: ReactNode
  if (subscriptionQuery.isLoading) {
    subscriptionBody = <Skeleton className='h-10 w-36' />
  } else if (subSummary.activeCount > 0) {
    subscriptionBody = (
      <div className='space-y-2'>
        <div className='flex items-baseline justify-between gap-2'>
          <span className='text-foreground font-mono text-2xl font-semibold tracking-tight tabular-nums'>
            {subSummary.hasUnlimited
              ? t('Unlimited')
              : formatQuota(subSummary.remainQuota)}
          </span>
          <span className='text-muted-foreground text-xs tabular-nums'>
            {subSummary.minRemainDays !== null
              ? `剩 ${subSummary.minRemainDays} 天`
              : `${subSummary.activeCount} 个生效`}
          </span>
        </div>
        {!subSummary.hasUnlimited && subSummary.totalQuota > 0 && (
          <div className='space-y-1'>
            <Progress value={subSummary.usagePercent} className='h-1.5' />
            <div className='text-muted-foreground flex justify-between text-[11px] tabular-nums'>
              <span>
                已用 {formatQuota(subSummary.usedQuota)} /{' '}
                {formatQuota(subSummary.totalQuota)}
              </span>
              <span>{subSummary.usagePercent}%</span>
            </div>
          </div>
        )}
      </div>
    )
  } else {
    subscriptionBody = (
      <div className='space-y-1.5'>
        <div className='text-foreground text-sm font-medium'>
          当前未开通订阅
        </div>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          个人 30 天体验包首单 ¥19.9 到账 ¥26（加赠 30%），超额自动衔接钱包余额。
        </p>
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Overview')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground h-8 gap-1.5 text-xs'
          onClick={() => toggleSetupGuide(!showSetupGuide)}
        >
          <Terminal className='size-3.5' aria-hidden='true' />
          {showSetupGuide ? '切换为数据概览' : '接入引导'}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-4'>
          {/* 1-line Dismissible Announcement Strip */}
          {showAnnouncementStrip && latestAnnouncement && (
            <div className='bg-card flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2 text-xs'>
              <button
                type='button'
                onClick={() => {
                  setSelectedAnnouncement(latestAnnouncement)
                  setAnnouncementDialogOpen(true)
                }}
                className='group flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none'
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    getAnnouncementColorClass(latestAnnouncement.type)
                  )}
                  aria-hidden='true'
                />
                <span className='text-foreground group-hover:text-primary truncate font-medium transition-colors'>
                  {getPreviewText(latestAnnouncement.content)}
                </span>
                <span className='text-muted-foreground hidden shrink-0 sm:inline'>
                  查看详情
                </span>
              </button>
              <div className='flex shrink-0 items-center gap-2'>
                <Link
                  to='/contact'
                  search={{ tab: 'announcements' } as never}
                  className='text-muted-foreground hover:text-foreground hidden text-[11px] transition-colors md:inline'
                >
                  全部公告
                </Link>
                <button
                  type='button'
                  onClick={handleDismissAnnouncement}
                  aria-label='关闭公告提示'
                  className='text-muted-foreground hover:text-foreground rounded-sm p-0.5 transition-colors'
                >
                  <X className='size-3.5' aria-hidden='true' />
                </button>
              </div>
            </div>
          )}

          {/* MODE 1: Cold-Start Launchpad (compact 2-col + 4-col status bar) */}
          {showSetupGuide ? (
            <>
              <div className='grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]'>
                {/* Left: Clean 3-Step Checklist */}
                <div className='bg-card flex flex-col justify-between rounded-xl border p-5'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='space-y-1'>
                      <div className='flex items-center gap-2'>
                        <h2 className='text-foreground text-base font-semibold tracking-tight'>
                          开始使用 Bozzii AI
                        </h2>
                        <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums'>
                          {completedSteps}/3
                        </span>
                      </div>
                      <p className='text-muted-foreground text-xs'>
                        完成以下三步即可在 2 分钟内发出首个 API 请求。
                      </p>
                    </div>
                  </div>

                  <ol className='mt-4 divide-y rounded-lg border'>
                    {onboardingSteps.map((step) => (
                      <li key={step.index}>
                        <Link
                          to={step.to}
                          className='group hover:bg-muted/35 flex items-center justify-between gap-3 px-3.5 py-3 transition-colors'
                        >
                          <div className='flex min-w-0 items-center gap-3'>
                            <span
                              className={cn(
                                'flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-medium',
                                step.completed
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : 'border-border text-muted-foreground'
                              )}
                            >
                              {step.completed ? (
                                <Check className='size-3.5' />
                              ) : (
                                step.index
                              )}
                            </span>
                            <div className='min-w-0'>
                              <div className='text-foreground truncate text-sm font-medium'>
                                {step.title}
                              </div>
                              <p className='text-muted-foreground truncate text-xs'>
                                {step.description}
                              </p>
                            </div>
                          </div>
                          <span className='text-muted-foreground group-hover:text-foreground inline-flex shrink-0 items-center gap-0.5 text-xs font-medium transition-colors'>
                            {step.cta}
                            <ChevronRight className='size-3.5' />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Right: Minimalist Monochrome Curl Snippet */}
                <div className='bg-card flex flex-col justify-between rounded-xl border p-5'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='space-y-0.5'>
                      <h3 className='text-foreground text-sm font-semibold'>
                        首个请求示例
                      </h3>
                      <p className='text-muted-foreground text-xs'>
                        默认模型：
                        <span className='text-foreground font-mono'>
                          {exampleModel}
                        </span>
                      </p>
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 gap-1.5 text-xs'
                      onClick={handleCopyCurl}
                      disabled={copyingCurl}
                    >
                      <Copy className='size-3.5' aria-hidden='true' />
                      复制命令
                    </Button>
                  </div>

                  <pre className='bg-muted/40 text-foreground mt-3.5 overflow-x-auto rounded-lg border p-3.5 font-mono text-xs leading-relaxed'>
                    <code>{curlDisplay}</code>
                  </pre>

                  <div className='text-muted-foreground mt-3.5 flex flex-wrap items-center justify-between gap-2 text-[11px]'>
                    <span className='inline-flex items-center gap-1.5'>
                      <span
                        className='size-1.5 rounded-full bg-emerald-500'
                        aria-hidden='true'
                      />
                      阿里云 CDN 就近加速 · OpenAI / Anthropic 协议兼容
                    </span>
                    <Link
                      to='/pricing'
                      className='hover:text-foreground inline-flex items-center gap-0.5 underline-offset-4 hover:underline'
                    >
                      查看模型定价
                      <ArrowUpRight className='size-3' />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Row 2: Compact 4-Col Account & Endpoint Status Bar */}
              <div className='bg-card grid grid-cols-1 divide-y rounded-xl border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x'>
                <div className='flex flex-col justify-between gap-1.5 p-4'>
                  <span className='text-muted-foreground text-xs font-medium'>
                    订阅与余额
                  </span>
                  <div className='flex items-baseline gap-2'>
                    <span className='text-foreground font-mono text-xl font-semibold tabular-nums'>
                      {subSummary.activeCount > 0
                        ? formatQuota(subSummary.remainQuota + walletQuota)
                        : formatQuota(walletQuota)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px] font-medium',
                        healthMeta.textClass
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          healthMeta.dotClass
                        )}
                      />
                      {healthMeta.label}
                    </span>
                  </div>
                </div>

                <div className='flex flex-col justify-between gap-1.5 border-t p-4 sm:border-t-0 sm:border-l xl:border-l-0'>
                  <span className='text-muted-foreground text-xs font-medium'>
                    API 密钥
                  </span>
                  <div className='flex items-baseline justify-between gap-2'>
                    <span className='text-foreground font-mono text-xl font-semibold tabular-nums'>
                      {activeKeyCount} 个活跃
                    </span>
                    <Link
                      to='/keys'
                      className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                    >
                      管理 →
                    </Link>
                  </div>
                </div>

                <div className='flex flex-col justify-between gap-1.5 border-t p-4 xl:border-t-0'>
                  <div className='flex items-center justify-between'>
                    <span className='text-muted-foreground text-xs font-medium'>
                      主接口
                    </span>
                    <div className='flex items-center gap-1'>
                      <button
                        type='button'
                        onClick={handleTestLatency}
                        disabled={pingStatus.testing}
                        className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors'
                      >
                        <Zap
                          className={cn(
                            'size-3',
                            pingStatus.testing && 'animate-pulse'
                          )}
                        />
                        {pingLabel}
                      </button>
                      <CopyButton
                        value={baseUrl}
                        variant='ghost'
                        size='sm'
                        className='size-6 p-0'
                        iconClassName='size-3'
                        tooltip={t('Copy URL')}
                        aria-label={t('Copy URL')}
                      />
                    </div>
                  </div>
                  <span className='text-foreground truncate font-mono text-sm font-medium'>
                    {baseUrl}
                  </span>
                </div>

                <div className='flex flex-col justify-between gap-1.5 border-t p-4 sm:border-l xl:border-t-0 xl:border-l-0'>
                  <span className='text-muted-foreground text-xs font-medium'>
                    帮助与支持
                  </span>
                  <div className='flex flex-wrap items-center gap-3 text-xs'>
                    <Link
                      to='/contact'
                      search={{ tab: 'faq' } as never}
                      className='text-foreground hover:text-primary font-medium transition-colors'
                    >
                      常见问答 →
                    </Link>
                    <Link
                      to='/contact'
                      className='text-muted-foreground hover:text-foreground transition-colors'
                    >
                      联系客服 →
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* MODE 2: Active Production Cockpit (Strict Single-Screen Layout) */
            <>
              {/* Row 1: Unified Asset Strip (Subscription + Wallet + Usage) */}
              <div className='bg-card grid grid-cols-1 divide-y rounded-xl border lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.15fr)] lg:divide-x lg:divide-y-0'>
                {/* Col 1: Subscription Credits */}
                <div className='flex flex-col justify-between gap-3 p-5'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-muted-foreground text-xs font-medium'>
                      订阅套餐额度
                    </span>
                    {isWalletVisible && (
                      <Link
                        to='/wallet'
                        className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                      >
                        {subSummary.activeCount > 0 ? '管理套餐 →' : '查看套餐 →'}
                      </Link>
                    )}
                  </div>
                  {subscriptionBody}
                </div>

                {/* Col 2: Wallet Balance */}
                <div className='flex flex-col justify-between gap-3 p-5'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-muted-foreground text-xs font-medium'>
                      钱包余额
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-medium',
                        healthMeta.textClass
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          healthMeta.dotClass
                        )}
                      />
                      {healthMeta.label}
                    </span>
                  </div>

                  <div className='space-y-2'>
                    <div className='text-foreground font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]'>
                      {formatQuota(walletQuota)}
                    </div>
                    <div className='flex items-center gap-3 text-xs'>
                      {isWalletVisible ? (
                        <Link
                          to='/wallet'
                          className='text-primary font-medium underline-offset-4 hover:underline'
                        >
                          按量充值 / 兑换码 →
                        </Link>
                      ) : (
                        <Link
                          to='/contact'
                          className='text-primary font-medium underline-offset-4 hover:underline'
                        >
                          联系商务充值 →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {/* Col 3: Usage Readout */}
                <div className='flex flex-col justify-between gap-3 p-5'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-muted-foreground text-xs font-medium'>
                      用量概览
                    </span>
                    <Link
                      to='/usage-logs/$section'
                      params={{ section: 'common' }}
                      className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                    >
                      使用日志 →
                    </Link>
                  </div>

                  <div className='grid grid-cols-3 gap-3'>
                    <div className='min-w-0'>
                      <div className='text-muted-foreground truncate text-[11px]'>
                        今日消耗
                      </div>
                      <div className='text-foreground mt-1 truncate font-mono text-base font-semibold tabular-nums'>
                        {formatQuota(recent24hUsage)}
                      </div>
                    </div>
                    <div className='min-w-0'>
                      <div className='text-muted-foreground truncate text-[11px]'>
                        累计消耗
                      </div>
                      <div className='text-foreground mt-1 truncate font-mono text-base font-semibold tabular-nums'>
                        {formatQuota(totalUsedQuota)}
                      </div>
                    </div>
                    <div className='min-w-0'>
                      <div className='text-muted-foreground truncate text-[11px]'>
                        总请求数
                      </div>
                      <div className='text-foreground mt-1 truncate font-mono text-base font-semibold tabular-nums'>
                        {formatNumber(totalRequests)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Single-Line API Readiness Bar */}
              <div className='bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs'>
                <div className='flex min-w-0 flex-wrap items-center gap-2.5'>
                  <span className='inline-flex items-center gap-1.5 font-medium'>
                    <span
                      className='size-1.5 rounded-full bg-emerald-500'
                      aria-hidden='true'
                    />
                    <span className='text-muted-foreground'>主接口</span>
                  </span>
                  <code className='bg-muted/50 text-foreground rounded px-2 py-0.5 font-mono text-xs'>
                    {baseUrl}
                  </code>
                  <CopyButton
                    value={baseUrl}
                    variant='ghost'
                    size='sm'
                    className='size-7 p-0'
                    iconClassName='size-3.5'
                    tooltip={t('Copy URL')}
                    aria-label={t('Copy URL')}
                  />
                  <button
                    type='button'
                    onClick={handleTestLatency}
                    disabled={pingStatus.testing}
                    className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors'
                  >
                    <Zap
                      className={cn(
                        'size-3',
                        pingStatus.testing && 'animate-pulse'
                      )}
                      aria-hidden='true'
                    />
                    {pingLabel}
                  </button>
                </div>

                <div className='flex flex-wrap items-center gap-3 text-xs'>
                  <Link
                    to='/keys'
                    className='text-muted-foreground hover:text-foreground transition-colors'
                  >
                    活跃密钥{' '}
                    <span className='text-foreground font-mono font-medium'>
                      {activeKeyCount}
                    </span>
                  </Link>
                  <span className='text-border' aria-hidden='true'>
                    |
                  </span>
                  <Link
                    to='/client-config'
                    className='text-muted-foreground hover:text-foreground transition-colors'
                  >
                    客户端配置
                  </Link>
                  <span className='text-border' aria-hidden='true'>
                    |
                  </span>
                  <Link
                    to='/contact'
                    search={{ tab: 'faq' } as never}
                    className='text-muted-foreground hover:text-foreground transition-colors'
                  >
                    常见问答
                  </Link>
                  <span className='text-border' aria-hidden='true'>
                    |
                  </span>
                  <Link
                    to='/contact'
                    className='text-muted-foreground hover:text-foreground transition-colors'
                  >
                    联系客服
                  </Link>
                </div>
              </div>

              {/* Row 3: Minimal Monochrome 7-Day Usage Trend */}
              <div className='bg-card rounded-xl border p-5'>
                <div className='flex flex-wrap items-baseline justify-between gap-2'>
                  <div className='flex flex-wrap items-baseline gap-3'>
                    <h2 className='text-foreground text-sm font-semibold'>
                      近 7 日消耗趋势
                    </h2>
                    <span className='text-muted-foreground font-mono text-xs tabular-nums'>
                      {activeHoveredDay
                        ? `${activeHoveredDay.label} · 消耗 ${formatQuota(activeHoveredDay.quota)} · ${formatNumber(activeHoveredDay.requests)} 次请求`
                        : `合计 ${formatQuota(sevenDayQuotaTotal)} · ${formatNumber(sevenDayRequestTotal)} 次请求`}
                    </span>
                  </div>
                  <Link
                    to='/dashboard/$section'
                    params={{ section: 'models' }}
                    className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                  >
                    详细数据看板 →
                  </Link>
                </div>

                {trendQuery.isLoading ? (
                  <Skeleton className='mt-4 h-28 w-full rounded-lg' />
                ) : (
                  <div className='mt-4 grid h-28 grid-cols-7 items-end gap-2 sm:gap-3'>
                    {trendPoints.map((pt, idx) => {
                      const ratio =
                        maxTrendQuota > 0
                          ? Math.max(0.06, pt.quota / maxTrendQuota)
                          : 0.04
                      const isHovered = hoveredDayIndex === idx
                      let barToneClass = 'bg-muted'
                      if (pt.quota > 0) {
                        barToneClass = isHovered
                          ? 'bg-foreground'
                          : 'bg-foreground/75 group-hover:bg-foreground'
                      }
                      return (
                        <button
                          key={pt.dateKey}
                          type='button'
                          onMouseEnter={() => setHoveredDayIndex(idx)}
                          onMouseLeave={() => setHoveredDayIndex(null)}
                          onFocus={() => setHoveredDayIndex(idx)}
                          onBlur={() => setHoveredDayIndex(null)}
                          aria-label={`${pt.label}: ${formatQuota(pt.quota)}, ${pt.requests} 次请求`}
                          className='group flex h-full flex-col items-center justify-end gap-1.5 outline-none'
                        >
                          <div className='flex w-full flex-1 items-end'>
                            <div
                              style={{
                                height: `${Math.round(ratio * 100)}%`,
                              }}
                              className={cn(
                                'w-full rounded-t-md transition-colors',
                                barToneClass
                              )}
                            />
                          </div>
                          <span
                            className={cn(
                              'font-mono text-[11px] tabular-nums transition-colors',
                              isHovered
                                ? 'text-foreground font-medium'
                                : 'text-muted-foreground'
                            )}
                          >
                            {pt.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Admin-only native health & uptime panels preserved cleanly below */}
          {isAdmin && (
            <div className='space-y-4'>
              <PerformanceHealthPanel />
              {showUptimePanel && <UptimePanel />}
            </div>
          )}
        </div>

        <AnnouncementDetailModal
          open={announcementDialogOpen}
          onOpenChange={setAnnouncementDialogOpen}
          announcement={selectedAnnouncement}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
