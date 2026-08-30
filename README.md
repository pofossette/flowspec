# FlowSpec — standalone

> 从 Trap-Map 彻底独立出来的思维导图规约项目。`flowspec/*.md` 是真相源，`^^^block` 增量挂载节点/边，前端 BlockNote 飞书式单栏编辑，Fastify 预览服务 + WS 热更新。

## 结构

- `packages/core` — 领域/锁/注册表/CLI/预览服务/画布适配器（原 `@trapmap/flow-spec`）
- `apps/web` — Vite + React19 + BlockNote 前端（原 `apps/flow-preview`）
- `flowspec/` — 示例文档（roadmap/demo/next-stage/showcase/complex-demo）

## 快速开始

```bash
pnpm install
pnpm --filter @flowspec/core build
pnpm --filter @flowspec/web build
# CLI
pnpm --filter @flowspec/core exec flowspec --help
pnpm --filter @flowspec/core exec flowspec flow serve --dir ./flowspec --port 5174
# 或后台
pnpm --filter @flowspec/core exec flowspec flow serve --port 5174 --dir ./flowspec
pnpm --filter @flowspec/core exec flowspec flow stop --dir ./flowspec
# 前端开发
pnpm --filter @flowspec/web dev -- --port 5173
```

## 迁移说明

- 零依赖 `@trapmap/*`，`server/routes` 已去 `InvocationError` 改本地 `FlowSpecError`。
- `.flowspec/mark.json` 与 `preview.json` 仍由 `findRepoRoot()` 定位（优先 `.git` / `pnpm-workspace.yaml`）。
