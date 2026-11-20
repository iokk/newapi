# 2026-11-21 Enterprise Compliance Footer & Quick Connect Hub

## Scope

1. **Official Compliance Footer & Trust Bar** (`web/public/brand/home.html` & `web/public/brand/connect.html`):
   - Added a 4-card enterprise compliance and trust strip aligned strictly with `About`, `Notice`, `legal.user_agreement`, and `legal.privacy_policy`:
     - **境内备案主体**：深圳市铂子科技有限责任公司（中国深圳）· `粤ICP备2026040043号-1`（链接至 `https://beian.miit.gov.cn/`）。
     - **对公结算与开票说明**：支持企业对公银行转账、正式合同签署与增值税发票开具，详见 `/user-agreement`。
     - **数据隐私承诺**：全链路 TLS 加密，透传官方接口，不用于模型训练、无广告追踪；审计日志默认保留 90 天，遵循跨境合规披露，详见 `/privacy-policy`。
     - **飞书专属对接渠道**：直连飞书在线客服/商务通道与 `support@bozzii.com`（2 个工作日内回复）。
   - Replaced placeholder beta workbench footer links (`xingyuqiusuo.com/product.html`) with a clean **一键接入与生态** column (`/brand/connect.html`, `/client-config`, `https://doc.bozzii.com/`, `https://status.bozzii.com/`).
2. **Homepage Navigation Cleanup & Quick Connect Hub** (`web/public/brand/home.html` + new `web/public/brand/connect.html`):
   - Removed unused top-navbar links (`对话`、`创作`、`编程`、`科研`) and corresponding `xingyuqiusuo.com` placeholder entries from the header, hero CTA, ticker, and `⌘K` palette.
   - Added **一键接入** (`/brand/connect.html`), **客户端中心** (`/client-config`), **接入文档** (`https://doc.bozzii.com/`), and **服务状态** (`https://status.bozzii.com/`) to the homepage navigation bar.
   - Built standalone bilingual light/dark Quick Connect Hub (`web/public/brand/connect.html`) covering **WorkBuddy / DeepSeek Harness**, **CodeBuddy**, **Claude Code**, **Codex CLI**, **Cherry Studio / Cursor / Cline**, and **cURL / Python / TypeScript / Anthropic SDK**, with a primary CTA jumping directly into the authenticated Client Hub (`/client-config`) and a local-only (never uploaded) snippet preview builder.

## How it is live (zero-downtime origin static deploy)

- Production container `xseek-new-api` (`ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.51-bozzii.1`) was **not restarted**; Postgres and Redis were untouched.
- Origin files uploaded with SHA-256 verification on `23.19.228.138`:
  - `/opt/1panel/www/sites/ai.bozzii.com/index/brand/home.html` (`1,103,200` bytes, `sha256:8518e5e33e44845e07ff10300e7578859120e248382a474eabadd53ccc5fdf90`)
  - `/opt/1panel/www/sites/ai.bozzii.com/index/brand/connect.html` (`74,856` bytes, `sha256:b9672f746d9f6b7eeef6c988b281ab73303156525ec54258f854013e2d5f4ddb`)
- OpenResty `/opt/1panel/www/sites/ai.bozzii.com/proxy/brand-cache.conf` updated to serve both `/brand/home.html` and `/brand/connect.html` directly from `/www/sites/ai.bozzii.com/index/brand/` with `Cache-Control: no-cache` and `X-Content-Type-Options: nosniff`; reloaded cleanly via `nginx -t && nginx -s reload`.
- Aliyun ESA edge cache purged (`SiteId: 184042911097052`, `TaskId: 1779476503461891`).
- Public HTTPS verification passed (`HTTP 200`, `Cache-Control: no-cache`, exact byte lengths, `/api/status` returned `success: true`).

## Console React Pages (`options.Footer`) — Admin UI Sync

Per `ops/CONTROL.md` rule `O-12`, runtime options are held in server memory and must be updated through the Admin UI (or authenticated admin API) rather than direct SQL. To upgrade the footer inside React pages (`/pricing`, `/dashboard`, `/client-config`, `/login`) without restarting `xseek-new-api`, paste the following HTML into **控制台 → 系统设置 → 站点设置 → 页脚 (`Footer`)** (backup of previous value saved at `/opt/xseek-new-api/backups/footer_pre_20261121.txt`):

```html
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;line-height:1.7;font-size:13px;"><span>© 2026 <strong>深圳市铂子科技有限责任公司</strong></span><span style="opacity:.4">·</span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;text-underline-offset:3px;">粤ICP备2026040043号-1</a><span style="opacity:.4">·</span><span>支持对公结算与增值税开票</span><span style="opacity:.4">·</span><span>透传官方接口 · 零训练隐私承诺</span><span style="opacity:.4">·</span><a href="https://ai.bozzii.com/brand/connect.html" style="text-decoration:underline;text-underline-offset:3px;">一键接入中心</a><span style="opacity:.4">·</span><a href="https://status.bozzii.com/" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;text-underline-offset:3px;">服务状态</a><span style="opacity:.4">·</span><a href="https://www.feishu.cn/invitation/page/add_contact/?token=53cgddeb-cca0-44ce-bf47-01b22d096bd1&amp;unique_id=zjiyrPYNA0hoEh1gNlp4Lg==" target="_blank" rel="noopener noreferrer" style="font-weight:600;text-decoration:underline;text-underline-offset:3px;">飞书直连客服</a></div>
```

## Rollback

```bash
cp -a /opt/1panel/www/sites/ai.bozzii.com/proxy/brand-cache.conf.bak-20261121 /opt/1panel/www/sites/ai.bozzii.com/proxy/brand-cache.conf
cp -a /opt/1panel/www/sites/ai.bozzii.com/index/brand/home.html.bak-20261121 /opt/1panel/www/sites/ai.bozzii.com/index/brand/home.html
docker exec 1Panel-openresty-1lUQ nginx -t && docker exec 1Panel-openresty-1lUQ nginx -s reload
```

Then purge `https://ai.bozzii.com/brand/home.html` and `https://ai.bozzii.com/brand/connect.html` in Aliyun ESA.
