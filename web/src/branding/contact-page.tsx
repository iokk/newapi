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
import { Link, useLocation } from '@tanstack/react-router'
import {
  Bell,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Gift,
  HelpCircle,
  Mail,
  MessageSquare,
  Search,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AnnouncementDetailModal } from '@/features/dashboard/components/overview/announcement-detail-dialog'
import {
  useAnnouncements,
  useFAQ,
} from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem, FAQItem } from '@/features/dashboard/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'

import { FEISHU_SUPPORT_URL, SUPPORT_EMAIL } from './brand-links'

type SupportTab = 'contact' | 'faq' | 'announcements'

function resolveSupportTab(searchStr: string): SupportTab {
  const params = new URLSearchParams(searchStr)
  const raw = params.get('tab')
  if (raw === 'faq' || raw === 'announcements') return raw
  return 'contact'
}

interface SupportMember {
  name: string
  role: string
  scope: string
  avatar: string
}

const SUPPORT_TEAM: readonly SupportMember[] = [
  {
    name: 'Jerry',
    role: '大客户商务',
    scope: '企业采购、定制方案、对公付款与开票对接',
    avatar: '/brand/contact/jerry.webp',
  },
  {
    name: 'Ming',
    role: '用户运营',
    scope: '产品更新通知、需求反馈收集与额度奖励发放',
    avatar: '/brand/contact/ming.webp',
  },
  {
    name: '小白',
    role: '客户支持',
    scope: '接口接入指导、报错定位与日常使用咨询',
    avatar: '/brand/contact/xiaobai.webp',
  },
]

export function ContactSupportPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: true })
  const emailCopied = copiedText === SUPPORT_EMAIL

  const { items: faqItems, loading: faqLoading } = useFAQ()
  const { items: announcementItems, loading: announcementsLoading } =
    useAnnouncements()

  const [activeTab, setActiveTab] = useState<SupportTab>(() =>
    resolveSupportTab(location.searchStr)
  )
  const [faqQuery, setFaqQuery] = useState('')
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false)

  useEffect(() => {
    setActiveTab(resolveSupportTab(location.searchStr))
  }, [location.searchStr])

  const filteredFaq = useMemo(() => {
    const q = faqQuery.trim().toLowerCase()
    if (!q) return faqItems
    return faqItems.filter(
      (item: FAQItem) =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
    )
  }, [faqItems, faqQuery])

  const handleTabChange = (next: string) => {
    if (next !== 'contact' && next !== 'faq' && next !== 'announcements') return
    setActiveTab(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (next === 'contact') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', next)
      }
      window.history.replaceState({}, '', url.toString())
    }
  }

  let faqBody: ReactNode
  if (faqLoading) {
    faqBody = (
      <div className='space-y-3 p-5'>
        {['f1', 'f2', 'f3', 'f4'].map((k) => (
          <Skeleton key={k} className='h-10 w-full rounded-lg' />
        ))}
      </div>
    )
  } else if (filteredFaq.length === 0) {
    faqBody = (
      <div className='text-muted-foreground py-12 text-center text-sm'>
        {faqQuery.trim()
          ? '未找到匹配问答，可切换至「联系客服」咨询专人支持。'
          : t('No FAQ entries available')}
      </div>
    )
  } else {
    faqBody = (
      <Accordion className='w-full px-5'>
        {filteredFaq.map((item: FAQItem, idx: number) => {
          const key = item.id ?? `faq-${idx}`
          return (
            <AccordionItem
              key={key}
              value={`item-${key}`}
              className='border-border/60'
            >
              <AccordionTrigger className='text-start hover:no-underline'>
                <Markdown className='text-sm leading-relaxed font-semibold'>
                  {item.question}
                </Markdown>
              </AccordionTrigger>
              <AccordionContent>
                <Markdown className='text-muted-foreground text-sm leading-relaxed'>
                  {item.answer}
                </Markdown>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    )
  }

  let announcementsBody: ReactNode
  if (announcementsLoading) {
    announcementsBody = (
      <div className='space-y-3 p-5'>
        {['a1', 'a2', 'a3'].map((k) => (
          <Skeleton key={k} className='h-12 w-full rounded-lg' />
        ))}
      </div>
    )
  } else if (announcementItems.length === 0) {
    announcementsBody = (
      <div className='text-muted-foreground py-12 text-center text-sm'>
        {t('No announcements at this time')}
      </div>
    )
  } else {
    announcementsBody = (
      <div className='divide-y'>
        {announcementItems.map((item: AnnouncementItem, idx: number) => (
          <button
            key={item.id ?? `ann-${idx}`}
            type='button'
            onClick={() => {
              setSelectedAnnouncement(item)
              setAnnouncementDialogOpen(true)
            }}
            className='group hover:bg-muted/35 flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors'
          >
            <div className='flex min-w-0 items-start gap-2.5'>
              <span
                className={cn(
                  'mt-1.5 inline-block size-2 shrink-0 rounded-full',
                  getAnnouncementColorClass(item.type)
                )}
              />
              <div className='min-w-0 space-y-1'>
                <p className='text-foreground text-sm font-medium'>
                  {getPreviewText(item.content)}
                </p>
                {item.publishDate && (
                  <time className='text-muted-foreground block font-mono text-xs tabular-nums'>
                    {formatDateTimeObject(new Date(item.publishDate))}
                  </time>
                )}
              </div>
            </div>
            <span className='text-muted-foreground group-hover:text-foreground shrink-0 text-xs transition-colors'>
              查看详情 →
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Contact Support')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className='h-8'>
            <TabsTrigger value='contact' className='h-7 px-3 text-xs'>
              联系客服
            </TabsTrigger>
            <TabsTrigger value='faq' className='h-7 px-3 text-xs'>
              常见问答{faqItems.length > 0 ? ` (${faqItems.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value='announcements' className='h-7 px-3 text-xs'>
              平台公告
              {announcementItems.length > 0
                ? ` (${announcementItems.length})`
                : ''}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-6'>
          {activeTab === 'contact' && (
            <>
              {/* Quick Self-Service FAQ Deflection Strip */}
              {faqItems.length > 0 && (
                <div className='bg-card rounded-xl border p-4'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-1.5 text-xs font-semibold'>
                      <HelpCircle
                        className='text-muted-foreground size-3.5'
                        aria-hidden='true'
                      />
                      <span>高频问题自助速查</span>
                    </div>
                    <button
                      type='button'
                      onClick={() => handleTabChange('faq')}
                      className='text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-xs transition-colors'
                    >
                      查看全部 {faqItems.length} 条问答
                      <ChevronRight className='size-3.5' />
                    </button>
                  </div>
                  <div className='mt-2.5 grid gap-2 sm:grid-cols-3'>
                    {faqItems.slice(0, 3).map((item, idx) => (
                      <button
                        key={item.id ?? `top-faq-${idx}`}
                        type='button'
                        onClick={() => handleTabChange('faq')}
                        className='bg-muted/30 hover:bg-muted/60 text-foreground line-clamp-2 rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors'
                      >
                        {item.question}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Notice & Feedback Reward Banner */}
              <div className='bg-card flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-start sm:justify-between'>
                <div className='space-y-1.5'>
                  <div className='flex items-center gap-2 text-sm font-semibold'>
                    <Bell
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                    <span>{t('Service notices and feedback rewards')}</span>
                  </div>
                  <p className='text-muted-foreground max-w-2xl text-sm leading-relaxed'>
                    我们将在各官方渠道第一时间推送服务消息与维护通知，并同步在「平台公告」发布提醒，请留意关注。如遇到问题或有任何建议，欢迎通过任意渠道联系或发送邮件反馈与投诉。
                  </p>
                  <p className='text-foreground flex items-center gap-1.5 text-sm font-medium'>
                    <Gift
                      className='text-primary size-4 shrink-0'
                      aria-hidden='true'
                    />
                    <span>经核实的有效客户反馈，我们将为您发放账户额度奖励。</span>
                  </p>
                </div>
                <Link
                  to='/usage-logs/$section'
                  params={{ section: 'common' }}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'shrink-0 self-start'
                  )}
                >
                  <FileText className='size-4' aria-hidden='true' />
                  {t('Usage Logs')}
                </Link>
              </div>

              {/* Support Team */}
              <section
                aria-labelledby='contact-team-heading'
                className='space-y-3'
              >
                <div className='space-y-0.5'>
                  <h2
                    id='contact-team-heading'
                    className='text-base font-semibold tracking-tight text-balance'
                  >
                    服务团队
                  </h2>
                  <p className='text-muted-foreground text-sm'>
                    商务合作、运营反馈与技术排障均有专人跟进
                  </p>
                </div>

                <div className='grid gap-4 sm:grid-cols-3'>
                  {SUPPORT_TEAM.map((member) => (
                    <div
                      key={member.name}
                      className='bg-card flex items-start gap-3.5 rounded-xl border p-4'
                    >
                      <img
                        src={member.avatar}
                        alt={`${member.name} - ${member.role}`}
                        width={52}
                        height={52}
                        decoding='async'
                        className='bg-muted size-[52px] shrink-0 rounded-full border object-cover'
                      />
                      <div className='min-w-0 space-y-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h3 className='text-sm font-semibold'>
                            {member.name}
                          </h3>
                          <span className='bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs font-medium'>
                            {member.role}
                          </span>
                        </div>
                        <p className='text-muted-foreground text-xs leading-relaxed'>
                          {member.scope}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Channels: WeChat QR + Feishu QR + Email */}
              <section
                aria-labelledby='contact-channels-heading'
                className='space-y-3'
              >
                <div className='space-y-0.5'>
                  <h2
                    id='contact-channels-heading'
                    className='text-base font-semibold tracking-tight text-balance'
                  >
                    联系方式
                  </h2>
                  <p className='text-muted-foreground text-sm'>
                    扫码添加微信或飞书，或直接发送邮件进行咨询、故障排查与投诉反馈
                  </p>
                </div>

                <div className='grid gap-4 md:grid-cols-2'>
                  {/* WeChat QR Card */}
                  <div className='bg-card flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center'>
                    <div className='space-y-1.5'>
                      <h3 className='flex items-center gap-2 text-sm font-semibold'>
                        <MessageSquare
                          className='text-muted-foreground size-4 shrink-0'
                          aria-hidden='true'
                        />
                        <span>微信使用咨询与故障排查</span>
                      </h3>
                      <p className='text-muted-foreground text-xs leading-relaxed'>
                        扫码添加专属客服微信，支持日常接入咨询、故障快速排查与产品建议反馈。
                      </p>
                    </div>
                    <img
                      src='/brand/contact/wechat-qr.webp'
                      alt='铂子 AI 微信客服二维码'
                      width={136}
                      height={202}
                      loading='lazy'
                      decoding='async'
                      className='h-auto w-[136px] shrink-0 self-center rounded-lg border bg-white object-contain p-1.5'
                    />
                  </div>

                  {/* Feishu QR + Direct Link Card */}
                  <div className='bg-card flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center'>
                    <div className='space-y-3'>
                      <div className='space-y-1.5'>
                        <h3 className='text-sm font-semibold'>
                          飞书商务与企业支持
                        </h3>
                        <p className='text-muted-foreground text-xs leading-relaxed'>
                          企业接入、对公采购、开票及高优先级排障，可扫码或点击直连原有飞书通道。
                        </p>
                      </div>
                      <a
                        href={FEISHU_SUPPORT_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                        className={cn(
                          buttonVariants({ variant: 'default', size: 'sm' }),
                          'w-fit'
                        )}
                      >
                        打开飞书直连
                        <ExternalLink className='size-3.5' aria-hidden='true' />
                      </a>
                    </div>
                    <img
                      src='/brand/contact/feishu-qr.webp'
                      alt='铂子 AI 飞书联系二维码'
                      width={136}
                      height={167}
                      loading='lazy'
                      decoding='async'
                      className='h-auto w-[136px] shrink-0 self-center rounded-lg border bg-white object-contain p-1.5'
                    />
                  </div>
                </div>

                {/* Email & Complaint Row */}
                <div className='bg-card flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center'>
                  <div className='space-y-1'>
                    <h3 className='flex items-center gap-2 text-sm font-semibold'>
                      <Mail
                        className='text-muted-foreground size-4 shrink-0'
                        aria-hidden='true'
                      />
                      <span>官方邮箱（商务合作 · 客户反馈 · 投诉建议）</span>
                    </h3>
                    <p className='text-muted-foreground text-xs leading-relaxed'>
                      普通咨询与投诉邮件将在 2 个工作日内由专人跟进回复；附带日志脱敏排障摘要可大幅缩短处理时间。
                    </p>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[Bozzii AI 反馈与排查] ')}`}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'font-mono text-xs'
                      )}
                    >
                      <Mail className='size-3.5' aria-hidden='true' />
                      {SUPPORT_EMAIL}
                    </a>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => copyToClipboard(SUPPORT_EMAIL)}
                    >
                      {emailCopied ? (
                        <Check
                          className='size-3.5 text-green-600 dark:text-green-400'
                          aria-hidden='true'
                        />
                      ) : (
                        <Copy className='size-3.5' aria-hidden='true' />
                      )}
                      <span aria-live='polite'>
                        {emailCopied ? t('Copied') : t('Copy')}
                      </span>
                    </Button>
                  </div>
                </div>
              </section>

              {/* 3-Step Troubleshooting Checklist */}
              <section
                aria-labelledby='contact-checklist-heading'
                className='bg-muted/30 rounded-xl border p-5'
              >
                <h2
                  id='contact-checklist-heading'
                  className='text-sm font-semibold text-balance'
                >
                  提交故障排查建议附带信息
                </h2>
                <p className='text-muted-foreground mt-1 text-xs'>
                  在「使用日志」点击任意报错记录即可一键复制已自动脱敏的排障摘要（不会包含您的
                  API Key 或对话正文）：
                </p>
                <ol className='text-muted-foreground mt-3 grid gap-2 text-xs sm:grid-cols-3'>
                  <li className='bg-card rounded-lg border px-3 py-2.5'>
                    <span className='text-foreground font-medium'>
                      1. Request ID
                    </span>
                    <p className='mt-0.5'>用于精确检索网关链路与上游响应记录</p>
                  </li>
                  <li className='bg-card rounded-lg border px-3 py-2.5'>
                    <span className='text-foreground font-medium'>
                      2. 时间与模型名
                    </span>
                    <p className='mt-0.5'>报错发生时间及调用的 Model ID</p>
                  </li>
                  <li className='bg-card rounded-lg border px-3 py-2.5'>
                    <span className='text-foreground font-medium'>
                      3. 报错摘要与客户端
                    </span>
                    <p className='mt-0.5'>HTTP 状态码、错误提示及使用的 SDK/工具</p>
                  </li>
                </ol>
              </section>
            </>
          )}

          {activeTab === 'faq' && (
            <section className='space-y-4'>
              <div className='flex flex-col justify-between gap-3 sm:flex-row sm:items-center'>
                <div className='space-y-0.5'>
                  <h2 className='text-base font-semibold tracking-tight'>
                    常见问答
                  </h2>
                  <p className='text-muted-foreground text-xs'>
                    计费规则、额度有效期、协议接入、限流与异常排查自助说明
                  </p>
                </div>
                <div className='relative w-full sm:w-64'>
                  <Search
                    className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-3.5'
                    aria-hidden='true'
                  />
                  <Input
                    value={faqQuery}
                    onChange={(e) => setFaqQuery(e.target.value)}
                    placeholder='搜索关键词（如 429、退款、缓存）'
                    className='h-8 pl-8 text-xs'
                  />
                </div>
              </div>

              <div className='bg-card rounded-xl border'>{faqBody}</div>
            </section>
          )}

          {activeTab === 'announcements' && (
            <section className='space-y-4'>
              <div className='space-y-0.5'>
                <h2 className='text-base font-semibold tracking-tight'>
                  平台公告
                </h2>
                <p className='text-muted-foreground text-xs'>
                  最新模型上线、线路维护、产品更新与活动通知归档
                </p>
              </div>

              <div className='bg-card overflow-hidden rounded-xl border'>
                {announcementsBody}
              </div>
            </section>
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
