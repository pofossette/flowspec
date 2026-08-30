# FlowSpec — standalone

> 从 Trap-Map 彻底独立出来的思维导图规约项目。`flowspec/*.md` 是真相源，`^^^block` 增量挂载节点/边，前端 BlockNote 飞书式单栏编辑，Fastify 预览服务 + WS 热更新。

## 结构

- `packages/domain` — FlowSpec 纯 schema 与类型（无解析）
- `packages/parser` — 统一 Markdown 解析器（`flow-spec-block` / `flow-spec-md`，`^^^node:`/`^^^edge:` 一行式 `metadata:id:type:x:y:targetid`）
- `packages/lock` — 文件锁与 frontmatter
- `packages/registry` — mark/preview 注册表与同步
- `packages/store` — Zustand 状态管理
- `packages/ai` — AI prompt 工具
- `packages/web` — React Flow 画布 UI（@flowspec/web）
- `packages/server` — Fastify 预览服务与路由（@flowspec/server）
- `apps/cli` — 独立 CLI（bin `flowspec`）
- `apps/web` — Vite + React19 + BlockNote 前端（@flowspec/web-app，原 `apps/flow-preview`）
- `flowspec/` — 示例文档（minimal/demo/showcase/complex-demo）

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

## 质量门禁

| 工具 | 作用 | 配置 | 命令 |
|------|------|------|------|
| `tsc` | 类型检查（全 monorepo） | `tsconfig.base.json` + 各包 `tsconfig.json` | `pnpm typecheck` / `pnpm -r typecheck` |
| `Biome` | 格式化 + Lint（含 organizeImports） | `biome.json` | `pnpm lint` / `pnpm lint:fix` / `pnpm format` |
| `Fallow` | 未用代码/依赖、复杂度、重复、健康度 | `.fallowrc.json` | `pnpm fallow` / `pnpm fallow:dead` / `pnpm fallow:health` / `pnpm fallow:dupes` |
| `jscpd` | 重复代码块（阈值 8%） | `.jscpd.json` | `pnpm jscpd` / `pnpm jscpd:report` |

常用组合：

```bash
pnpm check        # typecheck + lint + fallow:dead + jscpd
pnpm quality      # typecheck + lint + fallow 全量
pnpm lint:fix     # 自动修复 biome
pnpm fallow       # 完整健康报告（dead + dupes + health）
```

## 迁移说明

- 零依赖 `@trapmap/*`，`server/routes` 已去 `InvocationError` 改本地 `FlowSpecError`。
- `.flowspec/mark.json` 与 `preview.json` 仍由 `findRepoRoot()` 定位（优先 `.git` / `pnpm-workspace.yaml`）。
