# 客户端多 API Key 与编程工具配置设计

## 目的

让用户在客户端配置页为每个客户端选择自己的 API Key，并生成彼此独立的 WorkBuddy、DeepSeek Harness、Claude Code 和 Codex 配置。保留现有「提示词不含 Key、短期链接、一次性下载」的安全边界和默认一键体验。

## 目标

- 页面顶部提供 API Key 选择器；默认仍按客户端名称自动查找或创建专用 Key。
- 用户可选择自己已有的有效 Key，切换后重新生成提示词、下载配置或导入 CC Switch。
- 新增 Claude Code 和 Codex 配置；两者都支持 CC Switch 导入和无 CC Switch 时的本地配置指引。
- 复用现有 `CCSwitchDialog`，不新增第二套 CC Switch 模型选择界面。
- 完整回归、浏览器验证、隔离 staging 验证后再上线；最后合并分支并清理临时环境。

## 非目标

- 不修改数据库结构、Token 表、现有 Key 的配额/分组/权限或模型价格。
- 不改变现有 WorkBuddy、DSH 配置格式和匿名分享账户行为。
- 不在提示词、公开指南、链接、日志或页面预览中放完整 Key。
- 不让匿名分享链接配置 Claude Code 或 Codex。
- 不自动发送模型请求；配置完成后的真实对话由用户自行验证。
- 不增加新的管理端模型模板；编程客户端复用 WorkBuddy 模型清单。

## 方案比较

### 采用：短期链接绑定 Key ID

前端只提交 `token_id`，服务端验证归属后把它放入现有短期缓存条目。兑换时再次按 `token_id + user_id` 读取 Key 并检查状态。默认 `token_id=0` 走现有按客户端名称自动创建逻辑。

优点：提示词仍不含 Key；不新增数据库字段；完整 Key 只在已认证下载或一次性本机下载的响应中出现。成本是要把 Key ID 贯穿创建、兑换、直接下载三条路径。

### 不采用：参考站式完整 Key 提示词

实现较少，但 Key 会进入 AI 客户端聊天记录，且可能被继续转发，不符合现有安全设计。

### 不采用：另写 CC Switch 导入卡片和模型表单

可少改现有组件接口，但会重复 `CCSwitchDialog` 已有的 Claude/Codex/Gemini、模型选择和导入链接逻辑。

## 服务端设计

### 目标和模型

`ClientTarget` 增加 `claude`、`codex`：

| target | 自动 Key 名称 | 一次性下载文件 | 模型来源 |
| --- | --- | --- | --- |
| `workbuddy` | `WorkBuddy` | `models.json` | 原逻辑不变 |
| `dsh` | `DSH` | `dsh.json` | 原逻辑不变 |
| `claude` | `Claude Code` | `claude-code.json` | WorkBuddy 模板中 `claude-` 前缀 |
| `codex` | `Codex` | `codex.json` | WorkBuddy 模板中 `gpt-` 前缀，排除 `gpt-image-` |

Claude/Codex 可用性要求对应模型清单非空。默认模型取对应清单第一项；Claude 的 Opus、Sonnet、Haiku 分别取对应前缀的第一项，没有某档时回退到默认模型。以上默认规则是本设计的实现选择，不是用户额外提出的需求。

Claude 下载 JSON 字段：`api_key`、`base_url`（不加 `/v1`）、`models`、`default_model`、`opus_model`、`sonnet_model`、`haiku_model`。Codex 字段：`api_key`、`base_url`（末尾 `/v1`）、`models`、`default_model`。字段不包含其他账户信息。

### Key 绑定

- `clientLinkRequest` 增加 `token_id int`，缺省为 `0`。
- `clientLinkEntry` 增加 `TokenID int`，随用户链接条目复制到一次性下载条目。
- `NewClientLink(userID, tokenID int)` 在生成链接前验证非零 Key 属于用户且可用。
- `ClientConfigBody(userID int, target string, tokenID int)` 在生成配置时再次验证；Key 被禁用、删除、过期或不属于用户时返回统一的 unavailable 错误。
- 直接下载接收 `token_id` 查询参数；匿名分享强制使用 `token_id=0`。
- `ExchangeClientLink` 对 `a-` 分享码只允许 `workbuddy` 和 `dsh`，即使调用者手工改成 `claude` 或 `codex` 也拒绝。
- 原有一次性消费、设备绑定、TTL、统一 404 和限流不变。

### Claude Code / Codex 指南

公开指南只包含短期 code、站点地址和非敏感模型信息，不包含 Key。指南让可信的本地 AI：

1. 确认当前操作系统、实际用户和客户端/CC Switch 是否安装，只修改当前用户目录。
2. 用现有设备请求头换取一次性下载码，将配置下载到临时 JSON；不打印文件或 Key，不发模型测试请求。
3. 已安装 CC Switch 时，在本地从临时 JSON 构造 `ccswitch://v1/import` 并打开系统导入窗口，由用户核对确认；不直接修改 CC Switch 数据库。
4. 未安装 CC Switch 时，Claude Code 合并 `~/.claude/settings.json` 的 `env`：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL` 和三档模型变量，并移除冲突的旧 `ANTHROPIC_API_KEY`。Codex 合并 `~/.codex/config.toml`：独立 `model_provider`、默认模型、`base_url`、`wire_api="responses"` 和 `experimental_bearer_token`。
5. 写入前按原字节备份，用 JSON/TOML 解析器合并，保留 MCP、Skills、权限、其他供应商和项目设置；临时文件原子替换、限制为当前用户可读写、读回核对，失败恢复。
6. 最后删除临时配置和设备文件，只报告路径、备份和布尔核对结果，提醒用户自行发一条消息验证。

不写入参考站的 `modelPicker`，避免依赖未确认的 Claude Code 私有行为；模型清单作为 CC Switch 参数和用户选择依据。

## 前端设计

- `ClientConfig` 页面顶部放置共享 Key 选择器，标签为「API Key」，默认项为「自动选择或创建专用 Key」。列表来自现有 `/api/token/` 分页接口，获取全部页，仅显示启用且未过期的 Key；每项显示名称和脱敏 Key，空列表仍保留默认项。
- 四个客户端页签为 WorkBuddy、DeepSeek Harness、Claude Code、Codex。不可用页签沿用现有禁用逻辑。
- `TargetPanel` 接收 `tokenId`，所有生成、下载 mutation 都携带它；`tokenId` 改变时清空旧提示词、分享 URL 和安装命令，避免复制旧配置。
- WorkBuddy 的终端安装命令同样携带 `tokenId`。分享按钮仍只在原有分享开关下出现，且分享请求不携带用户选择的 Key。
- Claude/Codex 面板增加「导入 CC Switch」按钮。按钮通过现有认证下载接口取得所选配置的 Key，打开现有 `CCSwitchDialog`，并传入对应初始应用。Key 只存在组件内存，不写入 localStorage、URL 或日志。
- `CCSwitchDialog` 增加可选 `initialApp`（默认 `claude`），保留现有 Keys 页面调用行为。
- 新增文案进入全部七个 locale 文件，英文源文本作为 key。

## 安全控制

依据 OWASP ASVS 5.0.0、Authentication Cheat Sheet 和 Session Management Cheat Sheet，实施和测试以下适用控制：

- 服务端在链接创建和配置下载时均做 `user_id + token_id` 对象级授权，不能信任前端选择器。
- 继续使用 `UserAuth`、`DisableCache`、现有限流和会话 Cookie 来源保护；不新增绕过会话认证的 Key 导出接口。
- 短期 code 继续使用 CSPRNG、128 bit 随机值、服务端存哈希、30 分钟 TTL；下载码 10 分钟、设备绑定且原子单次消费。
- 完整 Key 不进入公开 URL、提示词、审计日志、控制台或持久化前端存储。
- 本次不增加密码、登录、MFA 或账户恢复流程，因此不改变现有重新认证策略；沿用 Keys 页面读取完整 Key 的认证和限流等级。

## 测试与发布约束

- 后端集中扩展现有 `service/client_link_test.go` 和 `controller/client_link_test.go`：默认兼容、选定 Key、跨用户/禁用/过期 Key、分享目标限制、两种新配置内容、公开指南无 Key、一次性兑换。
- 前端扩展现有 client-config 与 CC Switch 测试：分页 Key、默认项、切换清理旧输出、请求携带 Key ID、Claude/Codex 初始应用和异常状态。
- 运行受影响 Go 测试、前端 Vitest、`bun check -b`、涉及文件 lint、前端生产构建和 Go 构建。
- 启动本地应用，在浏览器验证四个页签、多个 Key、生成提示词、CC Switch 弹窗和无 Key 泄露；不修改用户真实 `~/.claude`、`~/.codex`、`~/.dsh` 或 `~/.workbuddy`。
- 无数据库变更，不需要三数据库迁移矩阵； staging 仍须按运维规范从最新生产备份恢复到隔离数据库，确认数据计数和现有客户端行为。
- 构建 `v1.0.0-rc.48-bozzii.7` linux/amd64 镜像；先做备份恢复证明和隔离 staging，再只替换生产 `new-api` 容器，不重启 PostgreSQL/Redis，不执行 `docker compose down`。
- 保存 compose 回滚副本和镜像 digest；线上验证健康、现有 WorkBuddy/DSH、多个 Key、新编程客户端配置。发布记录写入现有 ops 文档。
- 部署提交推送公开仓库后创建 PR 合并到 `main`，最后清理 worktree、临时 staging 和本地临时配置；生产旧镜像至少保留 24 小时，数据库备份按运维策略保留。

## 留给实现者的事项

- 使用项目现有 Select/Combobox、Card、CopyButton 和 Dialog 组合界面，具体排版以现有客户端配置页为准。
- 测试 fixture 使用明确的假 Key；不得输出真实生产 Key。
- 若官方客户端字段在实现前验证发现变化，只调整指南字段并补充测试，不改变 Key 绑定架构。
