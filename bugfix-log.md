# Bug 修复日志

按时间倒序记录。每条包含：现象、根因（文件与行）、修法、验证方式。

---

## 2026-11-11｜GPT 系模型输入计费虚高（上游固定注入未计费抵扣）— 已修复并验证通过

**现象（用户看到什么）**
客户反馈 gpt-6-* 系列每个请求的 `input_tokens` 比实际内容多出约 4,400 token：发送一个"好"字，上游返回 `prompt_tokens=4387`。这些 token 全额计入客户账单，长对话和高频调用场景下费用虚高明显。

**根因（具体到文件和行）**
不在网关代码，在上游侧：渠道 39（`Lei-OpenAI_2`，base_url `https://api4.baobaodns.com`）的上游识别 Codex 客户端后，自动为每个请求注入约 4,387 token 的 Codex 规格包装（系统说明与初始化数据），计入 `prompt_tokens`。网关转换层（`relaykit/relayconvert/internal/oai_chat/to_claude_messages_req.go`）原样转发，无法消除注入本身。

**修法（改了什么，为什么这样改）**
在管理后台 `系统设置 → 计费与支付 → 模型定价`，为 4 个 gpt-6-* 模型把输入计费项改为 `max(p - 4400, 0)`（4,400 = 4,387 注入 + 13 余量），输出与缓存项倍率不变。例如 gpt-6.1-terra：
```
tier("base", max(p - 4400, 0) * 1 + c * 5 + cr * 0.05 + cc * 1.25 + cc1h * 2.5)
```
选择计费抵扣而非请求改写，因为注入无法从网关侧剥离（在上游侧完成），而 `billing_expr` 引擎原生支持 `max()`（`pkg/billingexpr/run.go:143`），每请求自动生效，客户端零改动。

**怎么验证的**
2026-11-11 18:46–18:47 经网关 `ai.bozzii.com` 发 10 个最小请求（5 Claude + 5 GPT，token 21，日志 ID 27975–27984）。GPT 5 条上游均记 `pt=4392`，但计费 quota 只按输出与缓存计算：terra 118、astra 2,237、sol 236、luna 22（无抵扣时分别约 4,417 / 44,645 / 8,909 / 447）。表达式已确认写入 `options` 表 `billing_setting.billing_expr`，`cache_tokens=4224` 正常记录。

**以后怎么避免**
接入新上游时先测一次最小请求的 `input_tokens` 基线，发现固定注入立即在 `billing_expr` 配同款抵扣，并按渠道分别配置（不同上游注入量不同，公式不能混用）。

---

## 2026-11-11｜gpt-6.1 "崩溃后自动切换到 5.5 / DeepSeek / Kimi" — 已诊断，网关无需改动

**现象（用户看到什么）**
客户反馈：把大型复杂任务交给 gpt-6.1 后，回答到一半就"崩掉"，自动切换成 gpt-5.5，几句后又切到 DeepSeek 或 Kimi K3。

**根因**
两层，均不在网关代码：
1. **触发源**：11-10 上游对 gpt-6.1-sol 返回一波 503（`Service temporarily unavailable` / `Our servers are currently overloaded`），当日错误率 18.1%（23/127）；11-11 起回落到 1.0%、11-12 0.6%。gpt-6.1-terra 同期 0%。
2. **自动切换发生在客户端**：网关无任何跨模型自动降级逻辑（诊断字段 `returned_model` 近 7 天在 gpt-6.1 请求上全为空，即网关从未换过模型应答）。客户看到的降级链是 XSEEK 客户端自己的 fallback 策略在响应错误后逐级换模型。

**修法**
无网关代码改动。侧结论：网关的 `returned_model` 诊断字段（`relay/common/response_model.go`）可区分"网关换模型"与"客户端换模型"，本次全部为空证明网关侧零替换。

**怎么验证的**
2026-11-12 复核 2 天日志：按 type=5 错误日志统计（修正此前用文本匹配误算的"成功率 5%–22%"），sol 错误率 11-10 为 18.1%、11-11 为 1.0%、11-12 为 0.6%，terra 两天 0%；全部错误文本为上游 503/502 类。网关源码 grep 无跨模型 fallback 分支。

**以后怎么避免**
客户再报"自动换模型"时，先查 `returned_model` 字段：为空即客户端行为，连带核对当日上游 503 波动，不要先怀疑网关路由。

---

## 2026-11-11｜Claude 小请求输入虚高约 1,900 token — 已消除（渠道切换），待最终定位

**现象（用户看到什么）**
Claude 极小请求的 `input_tokens` 达 1,900+（如日志 27437：内容近 0，pt=1,939），客户按输入计费吃亏。

**根因（具体到文件和行）**
尚未最终定位。已排除两项：网关渠道配置的 `param_override`（`set system = []` + prepend 20 token CC 标识语）不是来源——带该规则的记录同样出现 1,939 token；也不是固定附加块——同一分钟内小请求有的 1,939、有的 32 token。已知事实：旧数据全部来自渠道 40（曾指向 baobaodns 系上游），该上游对 Claude Code 客户端注入 CC 系统块（见 `docs/newapi接入api4实测结论.md`）。

**修法**
渠道切换：2026-11-11 起 Claude 流量切至 nbwly 上游（渠道 4/40 现均指向 `https://api4-ai.nbwly.com`），该上游无 CC 包装注入。

**怎么验证的**
切换后最小请求 `input_tokens=43`（vs 切换前 1,939，降 97.8%）；2026-11-11 19:38 复测（token 1，日志 28003）pt=36。5 个验证请求（日志 27975–27979）`returned_model` 全空、全部 200。

**以后怎么避免**
上游切换后保留旧渠道日志查询能力，任何"输入虚高"类反馈先按渠道拆分对比 `prompt_tokens` 分布，再下结论。

---

## 2026-11-11｜/v1/chat/completions 缓存疑似失效 — 实测正常，无需修复

**现象（用户看到什么）**
此前报告 `/v1/chat/completions` 路由 Claude 缓存命中率低、疑似 `cache_control` 被网关丢弃。

**根因**
初判"转换层丢弃 `cache_control`"（`relaykit/relayconvert/internal/oai_chat/to_claude_messages_req.go` 确实未复制该字段，见 `relaykit/dto/openai_request.go:521` 的 dto 定义）——但实测证明上游在上游侧自动做了隐式缓存，该字段丢失不影响命中。

**修法**
无代码改动。

**怎么验证的**
2026-11-11 19:40 受控测试（token 1）：同前缀 system 块连发，第 2 次 `cache_read=3,677`；换新前缀独立缓存；完全不带 `cache_control` 也命中（`cache_read=3,384`），证明是上游隐式缓存。7 天生产日志命中率：opus chat 32.1% / messages 70.1%；sonnet chat 10.1% / messages 68.9% / responses 76.8%；fable-5-1 为 0% 是因其请求均为小 prompt（不达缓存阈值），非功能缺失。按天看 11-12 达 86.4%。

**以后怎么避免**
判断缓存问题先跑"同前缀连发 + 换前缀对照"受控测试，再查代码；小 prompt 零命中是正常现象，不要计入故障。
