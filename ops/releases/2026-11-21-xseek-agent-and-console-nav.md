# Release: `v1.0.0-rc.51-bozzii.2` — XSEEK Agent Live Launch & App/Console Navigation + Config Guide (2026-11-21)

## Summary

1. **XSEEK 办公智能体正式上线导向 (`https://xseekai.cn/index.html`)**：
   - 清理 `web/public/brand/home.html` 与 `web/public/brand/connect.html` 中所有残留的「正在内测 / Private Beta」文案与旧域名 `xingyuqiusuo.com`，统一升级为「已正式上线 · 预约演示 / 前往官网体验与使用」并指向 `https://xseekai.cn/index.html`。
   - 首页顶栏、Hero 主按钮与快捷入口、四大智能工作台模块、Quickstart、FAQ、页脚及 `⌘K` 命令面板均已接入 `XSEEK 智能体` 入口；一键接入中心新增 `XSEEK 办公智能体` 专属配置页签。
2. **Web App 顶部页签与控制台导航增强 (`CUSTOM(brand)`)**：
   - 新增独立品牌模块 `web/src/branding/brand-links.tsx`（遵循 `FORK.md` 新文件 + 一行挂钩原则）。
   - 共享顶部导航 `useTopNavLinks`（覆盖公开页 `PublicHeader`、移动端抽屉、控制台 `AppHeader`）新增 **`一键接入`**（`/brand/connect.html`）与 **`XSEEK 智能体`**（`https://xseekai.cn/index.html`）两个外部新标签页签；同步放宽 `PublicHeader` 滚动悬浮宽度至 `max-w-[60rem]` 防止截断。
   - 控制台顶部 `AppHeader` 在 `ClientSetupLink`（`/client-config`）旁增加响应式 **`XSEEK 智能体`** 快捷按钮（`XseekAgentLink`）。
   - 控制台侧边栏 `NavLink` / `SidebarMenuLink` 扩展 `external?: boolean` 支持，并在侧边栏新增 **`XSEEK 智能体`**（`Chat` 分组顶部）与 **`接入配置说明`**（`General` 分组，紧邻 `客户端配置` `/client-config`）。
   - 控制台独立配置页 `/client-config` 底部新增 **`接入配置说明与 XSEEK 办公智能体`** 指引卡片，提供三步接入说明及直达 `/brand/connect.html` 与 `https://xseekai.cn/index.html` 按钮。

## Build & Cut-over Record

- **Branch / Base**: `upgrade/v1.0.0-rc.51` (upstream tag `v1.0.0-rc.51`), built from commit `ff32e1168203afc134adbe64cb592aea502592f8`
- **Image**: `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.51-bozzii.2`
- **Architecture**: `linux/amd64` (native build on `23.19.228.138` using `docker build --network=host`)
- **Image ID**: `sha256:d85c5ac7804168efbcbe6c0a9c654979d9f7eade06034e3d64a51983e58f63fe`
- **Pre-cut-over Backup**:
  - Postgres dump: `/opt/xseek-new-api/backups/newapi-pre-rc51-bozzii2-20261120T203549Z.dump` (4.4 MiB, `0600`)
  - Compose backup: `/opt/xseek-new-api/backups/compose.yaml.pre-rc51-bozzii2-20261120T203549Z`
- **Rollback Target**: `ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.51-bozzii.1` (preserved on host and noted in `compose.yaml`)
- **Cut-over Command**: `docker compose up -d --no-deps new-api` (Postgres & Redis remained untouched, `Up 11 days (healthy)`)
- **Static Brand Sync**: Updated `/opt/1panel/www/sites/ai.bozzii.com/index/brand/{home,connect}.html` (`mode 0644`, SHA-256 verified) and purged Aliyun ESA cache.

## Verification

- **Unit Tests**: `vitest run` — **241 / 241** test files, **2,892 / 2,892** tests passing (including new `web/src/branding/__tests__/brand-links.test.tsx`).
- **Lint & Build**: `oxlint` 0 errors / 0 warnings on all touched files; `rsbuild build` clean.
- **Production Health**: `GET https://ai.bozzii.com/api/status` → `success: true`, `version: v1.0.0-rc.51-bozzii.2`, `system_name: Bozzii AI`; container `xseek-new-api` `healthy`.
- **Live Browser Verification (`1440×900`)**:
  - `/brand/home.html`: single-line navbar with `一键接入` & `XSEEK 智能体`, zero `正在内测` / `xingyuqiusuo.com` occurrences, `#workbenches` pointing to `https://xseekai.cn/index.html`; widened `.bozzii-hero-pillars` to `600px` with `white-space: nowrap` to prevent 2-line wrapping on the 3rd pill.
  - `/brand/connect.html`: single-line nav + 7 client tabs including `XSEEK 办公智能体`.
  - `/pricing` (React SPA `PublicHeader`): single-line top nav showing `一键接入` & `XSEEK 智能体` with zero truncation or overlap.
