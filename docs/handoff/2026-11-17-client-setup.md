# 交接：客户端接入界面（2026-11-17）

给接手的 agent。先读这条，再读 `ops/CONTROL.md`。生产镜像仍是 bozzii.7，这个分支还没发版。

## 现在线上是什么

- 站点：`ai.bozzii.com`，源站 `23.19.228.138`，目录 `/opt/xseek-new-api`。
- 镜像：`ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.7`
- 源码：`9084dd0be`（发布记录 `89673e42a`，文件 `ops/releases/2026-11-16-client-config-keys.md`）。
- 这一版已经有 WorkBuddy、DeepSeek Harness、Claude Code、Codex 四个页签，页内选择已有令牌，公开引导不带密钥，另有 CC Switch。入口只在侧边栏 `/client-config`，顶栏没有图标。
- 回滚：`/opt/xseek-new-api/compose.yaml.pre-bozzii7-20261116T080725Z`，镜像回到 `bozzii.6`。只重建 `new-api` 容器，不要动 Postgres 和 Redis。

## 本分支和最新代码的关系

- 分支：`claude/beautiful-solomon-737b20`
- 拉取请求：https://github.com/iokk/newapi/pull/10
- 已合并 `origin/main`（含 `9084dd0be` 和之后的运维文档）。配置页、令牌选择、CC Switch 和后端引导都用最新版。
- 相对最新版，本分支只多一个顶栏入口：`web/src/components/layout/components/app-header.tsx` 的 `ClientSetupLink`，指向 `/client-config`。
- 之前那套浏览器里拼接命令的页面已删掉，不要再加回来。

## 发版时还要做的

生产还是 bozzii.7。发这一版按 `ops/runbooks/04-release.md`，标签用 `v1.0.0-rc.48-bozzii.8`。先备份，再隔离验证，最后只重建应用容器。

## 不要动的配置

- `client_link_setting.anonymous_enabled` 保持关闭。`default` 组的 Claude 只走会返回 403 的渠道。
- 不要改渠道、模型模板、`cacheRetention`，也不要改用户自己的 `~/.dsh`。
- 令牌创建接口只返回成功，不返回密钥。列表里的密钥是打码的。线上引导走一次性链接，不在页面上拼环境变量。

## 本分支已经验证的范围

在 `web/` 执行：

```bash
bun run test src/features/client-config src/components/layout/components/__tests__/app-header-client-setup.test.tsx
```

结果：5 个文件，9 个测试通过。没有打开浏览器，没有构建镜像，没有连生产数据库。
