# Monorepo Restructure — packages / apps 设计

- **Date**: 2026-08-30
- **Author**: Muse Spark + User
- **Status**: Implemented
- **Scope**: 调整子包结构为 `packages/*`（各类子包）+ `apps/*`（cli / web 两个入口），完全移除 `packages/core` 聚合包

## 1. 背景与目标

当前结构：

```
packages/core   # 包含 domain/lock/registry/store/ai/web/server/preview/cli (单一包)
apps/web        # Vite + React 前端，依赖 @flowspec/core
```

问题：`@flowspec/core` 承载过多职责（领域、文件锁、注册表、状态、前后端适配、CLI、预览服务），边界模糊，无法按需安装与独立演进。

目标结构（用户确认：细粒度 7 包 + 完全移除 core + 独立可发布 CLI）：

```
packages/
  domain   -> @flowspec/domain
  lock     -> @flowspec/lock
  registry -> @flowspec/registry
  store    -> @flowspec/store
  ai       -> @flowspec/ai
  web      -> @flowspec/web
  server   -> @flowspec/server
apps/
  cli      -> flowspec CLI (bin: flowspec)
  web      -> Vite 前端 (保留，重构依赖)
```

成功标准：

- `pnpm-workspace.yaml` 包含 `packages/*` 和 `apps/*`
- `pnpm install` 后 workspace 依赖正确链接
- `pnpm --filter @flowspec/domain build` 等单包构建通过，`pnpm -r build` 全量通过
- `apps/cli` 可执行 `flowspec --help`、`flowspec serve` 等原有命令
- `apps/web` 正常 `pnpm dev` / `build`，代理到 `@flowspec/server` 提供的预览服务
- 无残留 `packages/core` 目录与引用

## 2. 设计原则

- 单一职责：每个 package 仅承载一个领域边界，可独立 version 与测试
- 显式依赖：通过 `workspace:*` 声明，不使用相对路径跨包
- 去中心化构建：每个 package 自带 `tsconfig.json` + `package.json` scripts，根通过 `pnpm -r` 编排
- 保持外部行为不变：CLI 命令、REST/WS API、FlowSpec schema 保持兼容

## 3. 方案对比（已决策）

### Approach A — 细粒度 7 包（采纳）

- 将 `src/` 下每个顶层目录拆为独立包
- 优点：职责最清晰，后续可按需抽离为外部依赖
- 缺点：包数量多，依赖图需精细维护
- 适用：长期演进、团队协作

### Approach B — 中粒度 4-5 包（未采纳）

- 合并 `lock+registry` 为 `@flowspec/fs`，`store+ai` 合并等
- 优点：包数量适中，依赖简单
- 缺点：仍有职责混合，未来需二次拆分

### Approach C — 保留 core 增量抽离（未采纳）

- 保留 `@flowspec/core` 作为平台包，增量创建 `@flowspec/ui` 等
- 优点：迁移风险最小
- 缺点：未解决核心臃肿问题

**决策**：用户选择 A，完全移除 core，独立 CLI。

## 4. 目标结构详述

### 4.1 目录布局

```
flowspec/
├── package.json                 # workspace root, scripts: dev/build/typecheck/test
├── pnpm-workspace.yaml          # packages: [packages/*, apps/*]
├── tsconfig.base.json
├── packages/
│   ├── domain/                  # @flowspec/domain
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── flow-spec.ts
│   │       ├── flow-spec-md.ts
│   │       ├── flow-spec-block.ts
│   │       └── index.ts
│   ├── lock/                    # @flowspec/lock
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── file-lock.ts, frontmatter.ts, helpers.ts, ops.ts, spec-io.ts, paths.ts, types.ts, index.ts
│   ├── registry/                # @flowspec/registry
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── paths.ts, types.ts, store.ts, helpers.ts, sync.ts, index.ts
│   ├── store/                   # @flowspec/store
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/{ flow-spec-store.ts, index.ts }
│   ├── ai/                      # @flowspec/ai
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/{ prompt.ts, index.ts }
│   ├── web/                     # @flowspec/web (canvas UI)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── adapter.ts, types.ts, FlowMapCanvas.tsx, FlowGlobalStyles.tsx
│   │       ├── nodes/, edges/, LockBanner.tsx, useFlowLock.ts, index.ts
│   └── server/                  # @flowspec/server (含 preview)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── routes.ts (原 server/routes.ts)
│           ├── index.ts
│           └── preview/
│               ├── server.ts, server/index.ts, server/flow-spec-routes.ts, server/helpers.ts, server/ws.ts, server/trapmap-routes.ts
├── apps/
│   ├── cli/                     # flowspec CLI 独立 app
│   │   ├── package.json         # name: flowspec | @flowspec/cli, bin: flowspec -> dist/run.js
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── run.ts, index.ts, daemon.ts, commands/*, commands.test.ts
│   └── web/                     # @flowspec/web-app 或 @flowspec/web (保留 apps/web)
│       ├── package.json         # name: @flowspec/web (应用), private:true
│       ├── vite.config.ts, tsconfig.json, index.html, src/*
│       └── ...
├── flowspec/                    # 示例文档
├── .flowspec/
└── docs/superpowers/specs/
```

### 4.2 Packages 职责与依赖

| Package | npm name | 源码来源 | 依赖 | 关键对外 API |
|---------|----------|---------|------|--------------|
| domain | @flowspec/domain | `core/src/domain/*` | `zod`, `yaml` | `flowSpecSchema`, `parseFlowSpecFromMarkdown`, `serializeFlowSpecToMarkdown`, `flowSpecToRF`, `FlowSpec` types |
| lock | @flowspec/lock | `core/src/lock/*` | `@flowspec/domain` | `acquireLock`, `releaseLock`, `readLockFromMarkdown`, `resolveSpecPath`, `LockInfo` |
| registry | @flowspec/registry | `core/src/registry/*` | `@flowspec/domain`, `@flowspec/lock` (仅 helpers) | `loadMark`, `loadPreview`, `saveMark`, `syncFromFilesystem`, `Registry` |
| store | @flowspec/store | `core/src/store/*` | `@flowspec/domain`, `@flowspec/lock` | `useFlowSpecStore`, `FlowSpecState` |
| ai | @flowspec/ai | `core/src/ai/*` | `@flowspec/domain`? (可选，当前仅字符串) | `FLOW_SPEC_SYSTEM_PROMPT`, `extractFlowSpecJson` |
| web | @flowspec/web | `core/src/web/*` | `@flowspec/domain`, `@flowspec/lock`, `@flowspec/store` (types) + peer `react`, `@xyflow/react` | `FlowMapCanvas`, `adapter` (flowSpecToRF/rfToFlowSpec), `nodes/edges` |
| server | @flowspec/server | `core/src/server/*` + `core/src/preview/*` | `@flowspec/domain`, `@flowspec/lock`, `@flowspec/registry`, `fastify`, `@fastify/*` | `createPreviewServer`, `PreviewServerOptions`, `FlowSpecRouteDefs` |
| cli (app) | `flowspec` (apps/cli) | `core/src/cli/*` | 以上所有 + `commander` | bin `flowspec`, `flowSpecCommandDefs` |
| web-app | @flowspec/web (apps/web) | 现有 apps/web | `@flowspec/domain`, `@flowspec/store`, `@flowspec/web`, `@flowspec/registry`, `@flowspec/lock`, `@flowspec/server` (dev proxy) | Vite SPA |

依赖有向无环图（DAG）：

```
domain <- lock <- registry <- server <- cli
domain <- store <- web <- cli
domain <- lock <- web
domain <- ai <- cli
registry -> server
```

无循环依赖。可通过 `madge` 或 `pnpm -r --filter` 验证。

### 4.3 Apps

#### apps/cli

- **Name**: `flowspec`（或 `@flowspec/cli` 私有发布前保持 `flowspec`），`private: true` 或 `false` 视发布策略
- **Bin**: `{ "flowspec": "./dist/run.js" }`，`run.ts` 顶部添加 `#!/usr/bin/env node`
- **Exports**: `./cli` 子路径可选，已移至 app，无需对外 exports
- **Scripts**: `build: tsc -p tsconfig.json`, `dev: tsx src/run.ts --help`, `typecheck: tsc --noEmit`, `test: vitest run`
- **Deps**: `commander`, `fastify` 间接通过 `@flowspec/server`，`workspace:*` 依赖所有 packages
- **Build 输出**: `dist/`，保留 `dist/run.js` 可执行权限

#### apps/web

- 保留 `apps/web` 目录与现有 Vite 配置
- 变更：
  - `package.json` dependencies: 将 `@flowspec/core` 替换为 `@flowspec/domain`, `@flowspec/store`, `@flowspec/web`, `@flowspec/registry`, `@flowspec/lock` 等细粒度 workspace 依赖
  - `tsconfig.json` paths: 原 `@flowspec/core` -> `@flowspec/domain` 等映射，或直接利用 workspace 解析移除 paths hack
  - `vite.config.ts` proxy 保持，`FLOW_PREVIEW_API` 默认指向 `@flowspec/server` 启动的 Fastify
  - `src/` 中对 `@flowspec/core/*` 的 import 全部改为对应细粒度包
- 保留 `apps/web/dist` 作为预览服务静态托管目录（`@flowspec/server` 搜索路径需更新，见第 5 节）

## 5. 关键改动点

### 5.1 Import 重写

- 每个 package 内部保持相对导入
- 跨包统一改为 `@flowspec/*` workspace 导入
- 示例：
  - `lock/file-lock.ts` : `from '../domain/flow-spec.js'` -> `from '@flowspec/domain'`
  - `registry/helpers.ts` : `from '../lock/helpers.js'` -> `from '@flowspec/lock'`
  - `web/adapter.ts` : `from '../domain/flow-spec.js'` -> `from '@flowspec/domain'`
  - `server/routes.ts` : 同理
  - `apps/cli/src/commands/add.ts` : `from '../../registry/store.js'` -> `from '@flowspec/registry'`

需批量替换，配合 `tsc` 验证。

### 5.2 package.json 与 tsconfig

- 每个 `packages/*` 包含：
  - `name: @flowspec/<pkg>`
  - `version: 0.1.0`
  - `type: module`
  - `main: ./dist/index.js`, `types: ./dist/index.d.ts`
  - `exports: { ".": { "types":..., "import":... } }`
  - `scripts: { build, typecheck, test }`
  - `dependencies: workspace:*` 按 DAG 声明
- `apps/cli`:
  - `name: flowspec`, `version: 0.1.0`, `private: false` 或 `true`（若不发布则 private）
  - `bin` / `type: module`
  - `scripts.build: tsc -p tsconfig.json`
- `apps/web`:
  - 移除 `@flowspec/core: workspace:*`，新增细粒度 deps
- `tsconfig.base.json` 保持不变，各包 `tsconfig.json` extends `../../tsconfig.base.json`，设置 `outDir: dist`, `rootDir: src`, `composite: true`
- 根 `tsconfig.json` 可新增 `references` 指向 packages/apps（可选，提升 typecheck 增量）

### 5.3 pnpm Workspace

- `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - apps/*
```

不变，但需确保新包被识别。

- 根 `package.json` scripts 更新：

```json
{
  "scripts": {
    "dev": "pnpm --filter @flowspec/web dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm --filter @flowspec/domain test && pnpm --filter @flowspec/registry test && pnpm --filter @flowspec/lock test && pnpm --filter flowspec test",
    "cli": "pnpm --filter flowspec exec flowspec",
    "serve": "pnpm --filter flowspec exec node ./dist/run.js flow serve",
    "preview:build": "pnpm --filter @flowspec/web build"
  }
}
```

### 5.4 Preview 服务静态路径

`@flowspec/server/src/preview/server/index.ts` 当前搜索 `apps/web/dist` 等路径。从 `packages/server` 视角，相对路径变为 `../../apps/web/dist`。需更新 `repoRootCandidates`：

- 新增 `path.resolve(thisDir, '../../../apps/web/dist')`（server dist -> repo root -> apps/web/dist）
- 保留 `process.cwd()` 探测
- 支持 `opts.previewDistDir` 覆盖

同时 `apps/cli` 的 `daemon.ts` 与 `commands/serve.ts` 中对 `dist-preview` 的引用需指向 `@flowspec/server` 输出。

### 5.5 二进制与可执行

- `apps/cli/src/run.ts` 确保 `chmod +x dist/run.js`，或在 `package.json` postbuild 钩子中处理
- `daemon.ts` 中 `spawn` 路径从 `packages/core/dist/cli/daemon.js` 调整为 `apps/cli/dist/daemon.js`（或通过 `fileURLToPath(import.meta.url)` 自定位，无需硬编码）

## 6. 数据流与接口

- **CLI 流程**: `commander` -> `commands/*` -> 调用 `@flowspec/domain` 解析 -> `@flowspec/lock` 锁控制 -> `@flowspec/registry` 更新 mark/preview -> 必要时 `spawn` `@flowspec/server` 的 `createPreviewServer`
- **Web 流程**: `apps/web/src/hooks/*` -> `@flowspec/store` zustand -> `@flowspec/web` canvas -> `fetch /api/flow-spec/:id` -> `@flowspec/server` Fastify routes -> `@flowspec/lock` / `@flowspec/domain` 校验 -> WS 热更新 (`preview/server/ws.ts`)
- **AI 流程**: `@flowspec/ai` prompt 生成 -> 需经 `@flowspec/domain` zod 校验后流入 store/server

错误处理沿用 `FlowSpecError`（在 `@flowspec/server` 保留），HTTP 状态码保持 `400/404/409/422`。

## 7. 测试策略

- 单元测试随包迁移：
  - `domain`: `flow-spec.test.ts`, `flow-spec-md.test.ts`
  - `lock`: `file-lock.test.ts`
  - `registry`: `store.test.ts`
  - `cli`: `commands.test.ts`（需更新 import 路径）
- 新增集成测试：`pnpm -r test` 全量通过
- Web 前端：`tsc --noEmit` + `vite build` 通过
- 手动验证：
  - `pnpm --filter flowspec exec flowspec --help`
  - `pnpm --filter flowspec exec flowspec flow serve --dir ./flowspec`
  - `pnpm --filter @flowspec/web dev` 访问 `http://127.0.0.1:5174`

## 8. 迁移步骤（概要）

1. 创建 `packages/domain|lock|registry|store|ai|web|server` 目录与 `package.json`/`tsconfig.json`/`src` 骨架
2. 拷贝 `packages/core/src/<module>` 到对应 package 的 `src/`
3. 创建 `apps/cli` 目录与配置，拷贝 `core/src/cli` 到 `apps/cli/src`
4. 重写所有跨包 import 为 `@flowspec/*`
5. 更新 `apps/web` 的 `package.json` 与 `tsconfig.json`，重写其 `src` 内对 `@flowspec/core` 的引用
6. 更新 `@flowspec/server` 的预览静态路径逻辑
7. 删除 `packages/core`，更新根 `package.json` scripts 与 `README.md`
8. `pnpm install`，`pnpm -r build`，`pnpm -r typecheck`，`pnpm --filter flowspec test` 等验证
9. 更新文档与提交

## 9. 风险与回退

- **风险1**: Import 路径遗漏导致 tsc 通过但运行时找不到模块。缓解：`pnpm -r build` + `node --check` + 手动 CLI smoke test
- **风险2**: `apps/cli` spawn daemon 路径错误导致 `serve` 失败。缓解：daemon 自定位 `fileURLToPath(import.meta.url)`，增加 fallback 探测
- **风险3**: Web 静态资源 404。缓解：同步更新 `repoRootCandidates`，添加 `previewDistDir` 显式参数
- **回退**: 若迁移后 `pnpm install` 异常，可 `git checkout -- packages/core` 临时恢复，保留新包并行验证

## 10. 非目标

- 不修改 FlowSpec schema 与业务逻辑
- 不引入 Turborepo / Changesets 等新工具链（后续可增）
- 不改变 `flowspec/*.md` 真相源格式
- 不重构前端组件架构（仅调整依赖）

## 11. 自检清单（待 writer 复核）

- [ ] 无 TBD/TODO 占位
- [ ] 7 包 + 2 Apps 数量与用户确认一致
- [ ] 依赖 DAG 无环，已标注
- [ ] 与现有 `tsconfig.base.json` / `pnpm-workspace.yaml` 兼容
- [ ] CLI bin 与 server 静态路径已明确迁移方案
