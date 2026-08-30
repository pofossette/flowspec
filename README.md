# FlowSpec — standalone

> 从 Trap-Map 彻底独立出来的思维导图规约项目。`flowspec/*.md` 是真相源，`^^^block` 增量挂载节点/边，前端 BlockNote 飞书式单栏编辑，Fastify 预览服务 + WS 热更新。

## 结构

- `packages/domain` — FlowSpec schema 与 markdown 解析
- `packages/lock` — 文件锁与 frontmatter
- `packages/registry` — mark/preview 注册表与同步
- `packages/store` — Zustand 状态管理
- `packages/ai` — AI prompt 工具
- `packages/web` — React Flow 画布 UI（@flowspec/web）
- `packages/server` — Fastify 预览服务与路由（@flowspec/server）
- `apps/cli` — 独立 CLI（bin `flowspec`）
- `apps/web` — Vite + React19 + BlockNote 前端（@flowspec/web-app，原 `apps/flow-preview`）
- `flowspec/` — 示例文档（roadmap/demo/next-stage/showcase/complex-demo）

## 快速开始

```bash
pnpm install
pnpm -r build
# CLI
pnpm --filter flowspec exec node ./dist/run.js --help
pnpm --filter flowspec exec node ./dist/run.js flow serve --dir ./flowspec --port 5174
# 或后台
pnpm --filter flowspec exec node ./dist/run.js flow serve --port 5174 --dir ./flowspec
pnpm --filter flowspec exec node ./dist/run.js flow stop --dir ./flowspec
# 前端开发
pnpm --filter @flowspec/web-app dev -- --port 5173
# 或统一
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```

## 迁移说明

- 零依赖 `@trapmap/*`，`server/routes` 已去 `InvocationError` 改本地 `FlowSpecError`。
- `.flowspec/mark.json` 与 `preview.json` 仍由 `findRepoRoot()` 定位（优先 `.git` / `pnpm-workspace.yaml`）。
