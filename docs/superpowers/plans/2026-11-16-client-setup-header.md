# 客户端接入指引 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登录用户在全站顶栏看到一个客户端接入入口，进入现有 `/client-config` 后能按 Claude Code、WorkBuddy、DSH、Codex 完成接入。

**Architecture:** 不新开路由。顶栏复用现有 `Button`/`Link` 指向 `/client-config`。页面在现有 WorkBuddy、DSH 一键配置上增加两个手动页签。Claude Code 与 Codex 在页内选择或新建 API Key，再按操作系统给出可复制命令，不把密钥写进后端一次性链接。

**Tech Stack:** React 19、TanStack Query、现有 Tabs/Card/CopyButton、`web/src/features/keys` 的 `getApiKeys` / `createApiKey`、i18next 七种语言。

**Spec:** 本文「已确认需求」。

## 已确认需求

- 入口：全站顶栏一个图标，进入统一页面，不并排四个客户端图标。
- 客户端：Claude Code、WorkBuddy、DSH、Codex。
- WorkBuddy、DSH 保持现有一键配置、分享和下载。
- Claude Code、Codex 只做手动引导：页内选已有令牌或新建令牌，再复制站点地址、密钥和对应系统命令。
- 系统：macOS、Windows、Linux。这是未再确认时的默认范围。
- 不做：管理员配置页改造、匿名分享、新的一键安装脚本、计费改动。

## Global Constraints

- 用户可见文案用 `t('English source')`，七个 locale 都要有对应键。
- 复用 `CopyButton`、`Tabs`、`Card`、`EmptyState`、`SectionPageLayout`，不新造复制按钮或弹窗壳。
- 密钥只在当前用户的已登录请求里出现，不进入 `guide_url`、分享落地页或安装脚本。
- 顶栏入口对所有已登录用户可见；页面仍服从现有 `client_link` 开关。WorkBuddy/DSH 未配置时只禁用对应页签，不挡住 Claude Code 和 Codex。

## Review Focus

- 没有可用令牌时，手动页必须能创建令牌，而不是只显示空列表。
- 切换客户端或操作系统后，复制内容必须换成当前组合，不能残留上一个命令。
- 顶栏在窄屏仍可点到入口，不能被搜索或语言切换挤出可点击区域。
- 新建令牌失败时保留表单和错误，不能把失败当成已选中的密钥。
- WorkBuddy/DSH 关闭时，Claude Code 和 Codex 仍可使用。

---

### Task 1: 顶栏入口

**Files:**
- Modify: `web/src/components/layout/components/app-header.tsx`
- Test: `web/src/components/layout/components/__tests__/app-header-client-setup.test.tsx`

**Interfaces:**
- Produces: 顶栏链接，`href="/client-config"`，可访问名称 `t('Client Setup')`，图标 `Plug`。

- [ ] **Step 1: Write the failing test**

渲染已登录顶栏，断言存在名为 Client Setup 的链接，目标是 `/client-config`。再把视口设为窄屏，断言该链接仍在文档中且未被 `hidden`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && bun run test src/components/layout/components/__tests__/app-header-client-setup.test.tsx`
Expected: FAIL，找不到该链接。

- [ ] **Step 3: Add the link**

在 `app-header.tsx` 默认右侧操作组、`TopNav` 之后放一个 icon `Button asChild` + `Link`。不改 `authenticated-layout.tsx`，不加 `leftContent`。

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/layout/components/app-header.tsx web/src/components/layout/components/__tests__/app-header-client-setup.test.tsx
git commit -m "feat: add client setup link to the header"
```

### Task 2: 四个客户端页签

**Files:**
- Modify: `web/src/features/client-config/index.tsx`
- Modify: `web/src/features/client-config/lib/prompt.ts`（仅当产品名常量表已在这里）
- Test: `web/src/features/client-config/__tests__/client-tabs.test.tsx`

**Interfaces:**
- Produces: 页签值 `claude-code`、`workbuddy`、`dsh`、`codex`。前两个手动页签始终可选；后两个仍按 `workbuddy_ready` / `dsh_ready` 禁用。

- [ ] **Step 1: Write the failing test**

`workbuddy_ready` 和 `dsh_ready` 都为 false 时，断言 Claude Code、Codex 页签可点，WorkBuddy、DSH 禁用，且不再渲染「Client setup is not available」整页空状态。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && bun run test src/features/client-config/__tests__/client-tabs.test.tsx`
Expected: FAIL。

- [ ] **Step 3: Split tab availability**

`TARGETS` 扩成四项。整页空状态只在接口失败或功能总开关关闭时使用；模型未就绪只禁用对应一键页签。

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/features/client-config/index.tsx web/src/features/client-config/lib/prompt.ts web/src/features/client-config/__tests__/client-tabs.test.tsx
git commit -m "feat: show coding client tabs without one-click setup"
```

### Task 3: 页内选择或创建令牌

**Files:**
- Create: `web/src/features/client-config/components/token-picker.tsx`
- Test: `web/src/features/client-config/__tests__/token-picker.test.tsx`
- Reuse: `web/src/features/keys/api.ts` 的 `getApiKeys`、`createApiKey`

**Interfaces:**
- Produces: `TokenPicker({ onSelect: (token: { id: number; key: string; name: string }) => void })`。
- 列表来自 `getApiKeys`；创建成功后调用 `onSelect`，参数里带后端返回的完整 key。

- [ ] **Step 1: Write the failing test**

覆盖三条：有令牌时选择后回调该 key；列表为空时显示创建表单；`createApiKey` 返回 `success: false` 时不调用 `onSelect`，并显示服务端错误。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && bun run test src/features/client-config/__tests__/token-picker.test.tsx`
Expected: FAIL。

- [ ] **Step 3: Implement `TokenPicker`**

用现有 Select 和最小创建表单，只收集名称。分组、额度和模型限制沿用 `createApiKey` 的现有默认值，不在此页重做令牌高级设置。

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/features/client-config/components/token-picker.tsx web/src/features/client-config/__tests__/token-picker.test.tsx
git commit -m "feat: pick or create an API key during client setup"
```

### Task 4: Claude Code 与 Codex 手动步骤

**Files:**
- Create: `web/src/features/client-config/lib/manual-client.ts`
- Create: `web/src/features/client-config/components/manual-client-panel.tsx`
- Modify: `web/src/features/client-config/index.tsx`
- Test: `web/src/features/client-config/__tests__/manual-client.test.tsx`

**Interfaces:**
- Consumes: `TokenPicker` 的 `onSelect`。
- Produces: `manualSetup({ client: 'claude-code' | 'codex'; os: 'macos' | 'windows' | 'linux'; baseUrl: string; apiKey: string }) -> { steps: string[]; command: string }`。

命令内容：

- Claude Code：`ANTHROPIC_BASE_URL=<origin>`，`ANTHROPIC_API_KEY=<key>`。Windows 用 `setx`，macOS/Linux 用 `export`。
- Codex：`OPENAI_BASE_URL=<origin>/v1`，`OPENAI_API_KEY=<key>`，同样按系统切换写法。
- `<origin>` 用 `window.location.origin`，不写死域名。

- [ ] **Step 1: Write the failing test**

断言四种组合的命令字符串：Claude Code + macOS、Claude Code + Windows、Codex + Linux、Codex + Windows。再渲染面板，从 macOS 切到 Windows 后，复制按钮拿到的文本必须改变。未选择令牌时不渲染密钥。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && bun run test src/features/client-config/__tests__/manual-client.test.tsx`
Expected: FAIL。

- [ ] **Step 3: Implement the pure helper and panel**

`manual-client.ts` 只拼字符串。面板用三个系统按钮和现有 `CopyButton`。步骤文案全部走 `t()`。

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/features/client-config/lib/manual-client.ts web/src/features/client-config/components/manual-client-panel.tsx web/src/features/client-config/index.tsx web/src/features/client-config/__tests__/manual-client.test.tsx
git commit -m "feat: add manual setup for Claude Code and Codex"
```

### Task 5: 文案与回归

**Files:**
- Modify: `web/src/i18n/locales/{en,zh,zh-TW,fr,ru,ja,vi}.json`

- [ ] **Step 1: Add English keys and run locale sync**

Run: `cd web && bun run i18n:sync`
Expected: 七个文件都包含新键；非英文暂时允许英文回填。

- [ ] **Step 2: Fill zh and zh-TW**

只翻译新增键。简体是用户主语言，繁体对照简体。

- [ ] **Step 3: Verify**

Run: `cd web && bun run test src/features/client-config src/components/layout/components/__tests__/app-header-client-setup.test.tsx && bun check -b`
Expected: 测试和类型检查通过。

- [ ] **Step 4: Commit**

```bash
git add web/src/i18n/locales
git commit -m "i18n: add client setup guide copy"
```
