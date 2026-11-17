# 交接：客户端接入界面（2026-11-17）

给接手的 agent。先读这条，再读线上那一版的 `ops/CONTROL.md`。不要从本分支直接发版。

## 现在线上是什么

- 站点：`ai.bozzii.com`，源站 `23.19.228.138`，目录 `/opt/xseek-new-api`。
- 镜像：`ghcr.io/iokk/bozzii-new-api:v1.0.0-rc.48-bozzii.7`
- 源码：`9084dd0be`（发布记录 `89673e42a`，文件 `ops/releases/2026-11-16-client-config-keys.md`）。
- 这一版已经有 WorkBuddy、DeepSeek Harness、Claude Code、Codex 四个页签，页内选择已有令牌，公开引导不带密钥，另有 CC Switch。入口只在侧边栏 `/client-config`，顶栏没有图标。
- 回滚：`/opt/xseek-new-api/compose.yaml.pre-bozzii7-20261116T080725Z`，镜像回到 `bozzii.6`。只重建 `new-api` 容器，不要动 Postgres 和 Redis。

## 本分支是什么，为什么不能拿去覆盖线上

- 分支：`claude/beautiful-solomon-737b20`
- 拉取请求：https://github.com/iokk/newapi/pull/10 （打开，未合并）
- 基底是 `6a692918b`，不包含 `9084dd0be`。
- 本分支自己做了一套更薄的页面：顶栏一个图标，Claude Code / Codex 在浏览器里拼 `export` / `setx` 命令，创建令牌后用 `fetchTokenKey` 取真实密钥。
- 线上那版把密钥放进一次性链接和本地下载，不把完整密钥放进公开引导。本分支没有 CC Switch，也没有服务端的 Claude / Codex 配置生成。
- 把本分支镜像发到生产会退回 bozzii.7。不要合并这个 PR 到 `brand/bozzii`，除非先在 `9084dd0be` 上重做差异。

## 线上还缺的那一块

只缺顶栏入口。做法：从 `9084dd0be` 拉分支，把本分支 `web/src/components/layout/components/app-header.tsx` 里的 `ClientSetupLink` 移过去。它是一个指向 `/client-config` 的链接，可访问名称是 `Client Setup`，图标是 `Plug`，不要用 `Button` 的 `render`，否则可访问角色会变成 button。

发版按 `ops/runbooks/04-release.md`，标签用 `v1.0.0-rc.48-bozzii.8`。`ops/build-image.sh v1.0.0-rc.48 8`。先备份，再隔离环境验证，最后只执行：

```bash
docker compose up -d --no-deps new-api
```

## 不要动的配置

- `client_link_setting.anonymous_enabled` 保持关闭。`default` 组的 Claude 只走会返回 403 的渠道。
- 不要改渠道、模型模板、`cacheRetention`，也不要改用户自己的 `~/.dsh`。
- 令牌创建接口只返回成功，不返回密钥。列表里的密钥是打码的。
- 本分支用的环境变量名没有对照过 Claude Code 和 Codex 当前文档。线上那版的模型列表和 base URL 以 `2026-11-16-client-config-keys.md` 为准。

## 本分支已经验证的范围

在 `web/` 执行：

```bash
bun run test src/features/client-config src/components/layout/components/__tests__/app-header-client-setup.test.tsx
```

结果：5 个文件，9 个测试通过。没有打开浏览器，没有构建镜像，没有连生产数据库。
