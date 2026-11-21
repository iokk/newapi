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
import { Link } from '@tanstack/react-router'
import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Gift,
  Mail,
  MessageSquare,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button, buttonVariants } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

import { FEISHU_SUPPORT_URL, SUPPORT_EMAIL } from './brand-links'

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
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: true })
  const emailCopied = copiedText === SUPPORT_EMAIL

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Contact Support')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-6'>
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
                我们将在各官方渠道第一时间推送服务消息与维护通知，并同步在网站公告栏发布提醒，请留意关注。如遇到问题或有任何建议，欢迎通过任意渠道联系或发送邮件反馈与投诉。
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
          <section aria-labelledby='contact-team-heading' className='space-y-3'>
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
                      <h3 className='text-sm font-semibold'>{member.name}</h3>
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
                  className='h-auto w-[136px] shrink-0 self-center rounded-lg border bg-white p-1.5 object-contain'
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
                  className='h-auto w-[136px] shrink-0 self-center rounded-lg border bg-white p-1.5 object-contain'
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
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
