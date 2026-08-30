# Monorepo Packages/Apps Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `packages/core` 拆分为 7 个细粒度 packages（domain/lock/registry/store/ai/web/server），新建 `apps/cli`，重构 `apps/web` 依赖，最终 `packages/core` 完全移除且 `pnpm -r build && pnpm -r typecheck` 全绿

**Architecture:** 按依赖 DAG 自底向上拆分（domain -> lock -> registry/store -> web/ai/server -> cli），每个包 workspace 互引，`apps/cli` 作为 bin 入口，`apps/web` 作为 Vite 应用，根 `package.json` 编排构建

**Tech Stack:** pnpm 10.33 workspace, TypeScript 5.9 (composite), Vite 7, Fastify 5, React 19, Zustand, Zod, Vitest

## Global Constraints

- pnpm-workspace.yaml 必须包含 `packages/*` 和 `apps/*`
- 每个 packages/* 的 name 为 `@flowspec/<pkg>`，type module，main `./dist/index.js`，types `./dist/index.d.ts`
- 删除 `packages/core` 后全量构建 `pnpm -r build` 必须通过
- `apps/cli` 的 bin 为 `flowspec -> ./dist/run.js`，run.ts 需 `#!/usr/bin/env node` 且 spawn 自定位
- `@flowspec/server` 需正确解析 `apps/web/dist` 静态资源
- 保持 FlowSpec schema、CLI 命令、REST/WS 接口不变
- 使用 `workspace:*` 互引，禁止相对跨包 `../../` 

---

### Task 1: Scaffold @flowspec/domain

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/src/flow-spec.ts`
- Create: `packages/domain/src/flow-spec-md.ts`
- Create: `packages/domain/src/flow-spec-block.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/flow-spec.test.ts` (copy)
- Create: `packages/domain/src/flow-spec-md.test.ts` (copy)

**Interfaces:**
- Consumes: 无（叶子）
- Produces: `@flowspec/domain` exports: `flowSpecSchema`, `safeParseFlowSpec`, `FlowSpec`, `parseFlowSpecFromMarkdown`, `serializeFlowSpecToMarkdown`, `stripBlocks`, `FlowSpecBlock` 等，供 lock/registry/store/web/server/cli

- [ ] **Step 1: 创建目录与 package.json**

创建 `packages/domain/package.json`:

```json
{
  "name": "@flowspec/domain",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "FlowSpec domain — schema + markdown parsing",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run --passWithNoTests" },
  "dependencies": { "yaml": "^2.8.3", "zod": "^4.1.12" },
  "devDependencies": { "typescript": "^5.9.3", "vitest": "^3.2.4", "tsx": "^4.19.0" }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 拷贝源码**

```bash
mkdir -p packages/domain/src
cp packages/core/src/domain/flow-spec.ts packages/domain/src/
cp packages/core/src/domain/flow-spec-md.ts packages/domain/src/
cp packages/core/src/domain/flow-spec-block.ts packages/domain/src/
cp packages/core/src/domain/index.ts packages/domain/src/
cp packages/core/src/domain/flow-spec.test.ts packages/domain/src/
cp packages/core/src/domain/flow-spec-md.test.ts packages/domain/src/  # 注意此文件实际在 src/domain 下
# 若 index.ts 中有对 web 的引用，需移除或替换（目前 domain 不应引用 web）
```

检查 `packages/domain/src/index.ts` 确保仅导出 domain：

```ts
export * from './flow-spec.js';
export * from './flow-spec-md.js';
export * from './flow-spec-block.js';
```

- [ ] **Step 4: 验证构建**

```bash
pnpm install
pnpm --filter @flowspec/domain build
pnpm --filter @flowspec/domain typecheck
pnpm --filter @flowspec/domain test
```

预期：`dist/index.js` 生成，无类型错误，`flow-spec.test.ts` 通过（若失败，检查 yaml/zod 版本）

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): scaffold @flowspec/domain from core/domain"
```

---

### Task 2: Scaffold @flowspec/lock

**Files:**
- Create: `packages/lock/package.json`
- Create: `packages/lock/tsconfig.json`
- Create: `packages/lock/src/*.ts` (helpers, file-lock, frontmatter, ops, paths, spec-io, types, index)
- Modify: `packages/lock/src/*` 内部跨包 import 改为 `@flowspec/domain`

**Interfaces:**
- Consumes: `@flowspec/domain` (FlowSpec, parseFlowSpecFromMarkdown, flowSpecSchema)
- Produces: `@flowspec/lock` exports: `acquireLock`, `releaseLock`, `getLockStatus`, `readLockFromMarkdown`, `writeLockToMarkdown`, `LockInfo`, `atomicWriteFileSync` 等

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@flowspec/lock",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run --passWithNoTests" },
  "dependencies": { "@flowspec/domain": "workspace:*", "yaml": "^2.8.3", "zod": "^4.1.12" },
  "devDependencies": { "typescript": "^5.9.3", "vitest": "^3.2.4", "tsx": "^4.19.0" }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }]
}
```

- [ ] **Step 3: 拷贝源码**

```bash
mkdir -p packages/lock/src
cp packages/core/src/lock/*.ts packages/lock/src/
# 包含 file-lock.ts file-lock.test.ts frontmatter.ts helpers.ts index.ts ops.ts paths.ts spec-io.ts types.ts
```

- [ ] **Step 4: 重写跨包 import**

在 `packages/lock/src` 下执行替换：

- `from '../domain/flow-spec.js'` -> `from '@flowspec/domain'`
- `from '../domain/flow-spec-md.js'` -> `from '@flowspec/domain'`
- 检查 `spec-io.ts`、`frontmatter.ts`、`file-lock.ts` 等文件
- `index.ts` 保持 `export * from './types.js'` 等相对路径不变

示例 `packages/lock/src/frontmatter.ts:1` 原：

```ts
import type { FlowSpecLock } from '../domain/flow-spec-md.js';
```

改为：

```ts
import type { FlowSpecLock } from '@flowspec/domain';
```

- [ ] **Step 5: 验证构建与测试**

```bash
pnpm install
pnpm --filter @flowspec/lock build
pnpm --filter @flowspec/lock typecheck
pnpm --filter @flowspec/lock test
```

需确保 `file-lock.test.ts` 能解析 `flowSpecExample` 来自 `@flowspec/domain`，若测试中仍 `import { flowSpecExample } from '../domain/flow-spec.js'` 需改为 `@flowspec/domain`。

- [ ] **Step 6: Commit**

```bash
git add packages/lock
git commit -m "feat(lock): scaffold @flowspec/lock with domain dep"
```

---

### Task 3: Scaffold @flowspec/registry

**Files:**
- Create: `packages/registry/package.json`
- Create: `packages/registry/tsconfig.json`
- Create: `packages/registry/src/*.ts` (helpers, paths, store, sync, types, index, store.test.ts)

**Interfaces:**
- Consumes: `@flowspec/domain`, `@flowspec/lock` (atomicWriteFileSync)
- Produces: `@flowspec/registry` exports: `loadMark`, `loadPreview`, `saveMark`, `syncFromFilesystem`, `Registry` types

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@flowspec/registry",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run --passWithNoTests" },
  "dependencies": { "@flowspec/domain": "workspace:*", "@flowspec/lock": "workspace:*", "zod": "^4.1.12", "yaml": "^2.8.3" },
  "devDependencies": { "typescript": "^5.9.3", "vitest": "^3.2.4" }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "composite": true, "tsBuildInfoFile": "./dist/.tsbuildinfo", "noUnusedLocals": false, "noUnusedParameters": false },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }, { "path": "../lock" }]
}
```

- [ ] **Step 3: 拷贝**

```bash
mkdir -p packages/registry/src
cp packages/core/src/registry/*.ts packages/registry/src/
```

- [ ] **Step 4: 重写 import**

- `from '../lock/helpers.js'` -> `from '@flowspec/lock'`
- `from '../domain/flow-spec.js'` -> `from '@flowspec/domain'`
- `from '../domain/flow-spec-md.js'` -> `from '@flowspec/domain'`
- `registry/helpers.ts` 中 `import { atomicWriteFileSync } from '../lock/helpers.js'` 改为 `from '@flowspec/lock'`
- `registry/store.test.ts` 中 `import { flowSpecExample } from '../domain/...'` 改为 `@flowspec/domain`

示例 `packages/registry/src/helpers.ts:2`:

```ts
// before
import { atomicWriteFileSync } from '../lock/helpers.js';
import { parseFlowSpecFromMarkdown } from '../domain/flow-spec-md.js';
// after
import { atomicWriteFileSync } from '@flowspec/lock';
import { parseFlowSpecFromMarkdown } from '@flowspec/domain';
```

- [ ] **Step 5: 验证**

```bash
pnpm install
pnpm --filter @flowspec/registry build
pnpm --filter @flowspec/registry typecheck
pnpm --filter @flowspec/registry test
```

预期 `store.test.ts` 通过（依赖 vitest、zod）

- [ ] **Step 6: Commit**

```bash
git add packages/registry
git commit -m "feat(registry): scaffold @flowspec/registry"
```

---

### Task 4: Scaffold @flowspec/store

**Files:**
- Create: `packages/store/package.json`
- Create: `packages/store/tsconfig.json`
- Create: `packages/store/src/flow-spec-store.ts`
- Create: `packages/store/src/index.ts`

**Interfaces:**
- Consumes: `@flowspec/domain`, `@flowspec/lock`
- Produces: `@flowspec/store` exports: `useFlowSpecStore`, `FlowSpecState`

- [ ] **Step 1: package.json**

```json
{
  "name": "@flowspec/store",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run --passWithNoTests" },
  "dependencies": { "@flowspec/domain": "workspace:*", "@flowspec/lock": "workspace:*", "zustand": "^5.0.14" },
  "devDependencies": { "typescript": "^5.9.3", "vitest": "^3.2.4" }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "composite": true, "tsBuildInfoFile": "./dist/.tsbuildinfo", "jsx": "react-jsx", "lib": ["ES2022","DOM"], "noUnusedLocals": false, "noUnusedParameters": false },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }, { "path": "../lock" }]
}
```

- [ ] **Step 3: 拷贝**

```bash
mkdir -p packages/store/src
cp packages/core/src/store/flow-spec-store.ts packages/store/src/
cp packages/core/src/store/index.ts packages/store/src/
```

- [ ] **Step 4: 重写 import**

`packages/store/src/flow-spec-store.ts`:

```ts
// before
import type { FlowSpec } from '../domain/flow-spec.js';
import { flowSpecExample } from '../domain/flow-spec.js';
import type { LockInfo } from '../lock/types.js';
// after
import type { FlowSpec } from '@flowspec/domain';
import { flowSpecExample } from '@flowspec/domain';
import type { LockInfo } from '@flowspec/lock';
```

- [ ] **Step 5: 验证**

```bash
pnpm --filter @flowspec/store build
pnpm --filter @flowspec/store typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/store
git commit -m "feat(store): scaffold @flowspec/store"
```

---

### Task 5: Scaffold @flowspec/ai

**Files:**
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/ai/src/prompt.ts`
- Create: `packages/ai/src/index.ts`

**Interfaces:**
- Consumes: 无或 `@flowspec/domain` (可选)
- Produces: `FLOW_SPEC_SYSTEM_PROMPT`, `FLOW_SPEC_USER_TEMPLATE`, `extractFlowSpecJson`

- [ ] **Step 1: package.json**

```json
{
  "name": "@flowspec/ai",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": { "@flowspec/domain": "workspace:*" },
  "devDependencies": { "typescript": "^5.9.3" }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "composite": true, "tsBuildInfoFile": "./dist/.tsbuildinfo", "noUnusedLocals": false },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }]
}
```

- [ ] **Step 3: 拷贝**

```bash
mkdir -p packages/ai/src
cp packages/core/src/ai/prompt.ts packages/ai/src/
cp packages/core/src/ai/index.ts packages/ai/src/
```

检查 `prompt.ts` 是否引用 domain，若无则可移除 `@flowspec/domain` 依赖。

- [ ] **Step 4: 验证**

```bash
pnpm --filter @flowspec/ai build
pnpm --filter @flowspec/ai typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/ai
git commit -m "feat(ai): scaffold @flowspec/ai"
```

---

### Task 6: Scaffold @flowspec/web (canvas UI)

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/src/*` (adapter, types, FlowMapCanvas, nodes, edges, LockBanner, useFlowLock, etc.)

**Interfaces:**
- Consumes: `@flowspec/domain`, `@flowspec/lock`, `@flowspec/store` (types only)
- Produces: `FlowMapCanvas`, `flowSpecToRF`, `rfToFlowSpec`, `LockBanner`, `useFlowLock`, nodes/edges components

- [ ] **Step 1: package.json**

```json
{
  "name": "@flowspec/web",
  "version": "0.1.0",
  "type": "module",
  "description": "FlowSpec canvas UI",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": { "@flowspec/domain": "workspace:*", "@flowspec/lock": "workspace:*", "@flowspec/store": "workspace:*", "zustand": "^5.0.14", "zod": "^4.1.12" },
  "peerDependencies": { "@xyflow/react": "^12.0.0", "react": "^19.0.0", "react-dom": "^19.0.0" },
  "peerDependenciesMeta": { "react": { "optional": true }, "react-dom": { "optional": true }, "@xyflow/react": { "optional": true } },
  "devDependencies": { "typescript": "^5.9.3", "@types/react": "^19.2.2", "@types/react-dom": "^19.2.2", "react": "^19.2.7", "react-dom": "^19.2.7", "@xyflow/react": "^12.11.3" }
}
```

Note: `avoid-nodes-edge`, `@tisoap/react-flow-smart-edge` 若在 `FlowMapCanvas.tsx` 使用，需一并迁移。

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "composite": true, "tsBuildInfoFile": "./dist/.tsbuildinfo", "jsx": "react-jsx", "lib": ["ES2022","DOM"], "noUnusedLocals": false, "noUnusedParameters": false },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }, { "path": "../lock" }, { "path": "../store" }]
}
```

- [ ] **Step 3: 拷贝**

```bash
mkdir -p packages/web/src/nodes packages/web/src/edges
cp packages/core/src/web/*.ts packages/web/src/ 2>/dev/null || true
cp packages/core/src/web/*.tsx packages/web/src/ 2>/dev/null || true
cp -r packages/core/src/web/nodes packages/web/src/
cp -r packages/core/src/web/edges packages/web/src/
# 确保 index.ts 存在
```

验证 `packages/web/src/index.ts` 内容完整（见 spec §4.1）

- [ ] **Step 4: 重写 import**

- `from '../domain/flow-spec.js'` -> `from '@flowspec/domain'`
- `from '../lock/types.js'` -> `from '@flowspec/lock'`
- `from '../store/flow-spec-store.js'` -> `from '@flowspec/store'` 若有
- `web/adapter.ts` 导入 FlowSpec 类型改为 `@flowspec/domain`
- `web/types.ts` 同理
- `web/useFlowLock.ts` 中 `LockInfo` 改为 `@flowspec/lock`

示例 `packages/web/src/adapter.ts:1`:

```ts
import type { FlowSpec } from '@flowspec/domain';
```

- [ ] **Step 5: 验证**

```bash
pnpm install
pnpm --filter @flowspec/web build
pnpm --filter @flowspec/web typecheck
```

检查 `FlowMapCanvas.tsx` 中对 `@xyflow/react` 的 peer 是否正确，缺失则补 `devDependencies`。

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): scaffold @flowspec/web canvas"
```

---

### Task 7: Scaffold @flowspec/server (含 preview)

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/routes.ts` (原 server/routes.ts)
- Create: `packages/server/src/preview/server.ts`
- Create: `packages/server/src/preview/server/index.ts`
- Create: `packages/server/src/preview/server/flow-spec-routes.ts`
- Create: `packages/server/src/preview/server/helpers.ts`
- Create: `packages/server/src/preview/server/ws.ts`
- Create: `packages/server/src/preview/server/trapmap-routes.ts`

**Interfaces:**
- Consumes: `@flowspec/domain`, `@flowspec/lock`, `@flowspec/registry`
- Produces: `createPreviewServer`, `PreviewServerOptions`, `FlowSpecRouteDefs`, `FlowSpecError`

- [ ] **Step 1: package.json**

```json
{
  "name": "@flowspec/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./preview": { "types": "./dist/preview/index.d.ts", "import": "./dist/preview/index.js" }
  },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": {
    "@flowspec/domain": "workspace:*",
    "@flowspec/lock": "workspace:*",
    "@flowspec/registry": "workspace:*",
    "fastify": "^5.3.0",
    "@fastify/cors": "^11.3.0",
    "@fastify/static": "^10.1.3",
    "@fastify/websocket": "^11.3.0",
    "zod": "^4.1.12",
    "yaml": "^2.8.3"
  },
  "devDependencies": { "typescript": "^5.9.3" }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "composite": true, "tsBuildInfoFile": "./dist/.tsbuildinfo", "lib": ["ES2022","DOM"], "noUnusedLocals": false },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }, { "path": "../lock" }, { "path": "../registry" }]
}
```

- [ ] **Step 3: 拷贝**

```bash
mkdir -p packages/server/src/preview/server
cp packages/core/src/server/routes.ts packages/server/src/routes.ts
cp packages/core/src/server/index.ts packages/server/src/index.ts
cp packages/core/src/preview/server.ts packages/server/src/preview/server.ts
cp packages/core/src/preview/index.ts packages/server/src/preview/index.ts
cp packages/core/src/preview/server/*.ts packages/server/src/preview/server/
```

目录结构建议 flat：`src/routes.ts`, `src/preview/server.ts`, `src/preview/server/*` 保持原样以减少 diff。

- [ ] **Step 4: 调整 preview 静态路径**

修改 `packages/server/src/preview/server/index.ts` 中 `repoRootCandidates`：

 原（packages/core 视角）：
```ts
path.resolve(thisDir, '../../../../apps/web/dist'),
```

 新（packages/server 视角，dist 为 packages/server/dist）：
```ts
const repoRootCandidates = [
  path.resolve(thisDir, '../../../apps/web/dist'), // server dist -> packages -> root -> apps/web/dist
  path.resolve(thisDir, '../../../../apps/web/dist'),
  path.resolve(thisDir, '../../../apps/web/dist'),
  path.resolve('apps/web/dist'),
  path.resolve(process.cwd(), 'apps/web/dist'),
];
```

确保新增 `path.resolve(thisDir, '../../../apps/web/dist')` 覆盖新布局，同时保留 `opts.previewDistDir` 优先。

- [ ] **Step 5: 重写 import**

- `from '../domain/...'` -> `@flowspec/domain`
- `from '../lock/...'` -> `@flowspec/lock`
- `from '../registry/...'` -> `@flowspec/registry`
- `server/routes.ts` 中 `flowSpecSchema` 改为 `@flowspec/domain`
- `preview/server/flow-spec-routes.ts` 同理

验证 `packages/server/src/index.ts`:

```ts
export * from './routes.js';
export { createPreviewServer } from './preview/server/index.js';
export type { PreviewServerOptions } from './preview/server/index.js';
```

- [ ] **Step 6: 验证**

```bash
pnpm --filter @flowspec/server build
pnpm --filter @flowspec/server typecheck
```

启动冒烟：`node packages/server/dist/preview/server/index.js --help` 需无报错（若无 CLI，仅验证 import）

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): scaffold @flowspec/server with preview"
```

---

### Task 8: Scaffold apps/cli

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/run.ts`
- Create: `apps/cli/src/index.ts`
- Create: `apps/cli/src/daemon.ts`
- Create: `apps/cli/src/commands/*`
- Create: `apps/cli/src/commands.test.ts`

**Interfaces:**
- Consumes: `@flowspec/domain`, `@flowspec/lock`, `@flowspec/registry`, `@flowspec/server`, `@flowspec/ai` (可选)
- Produces: bin `flowspec`, exports `flowSpecCommandDefs`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "flowspec",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "FlowSpec CLI",
  "bin": { "flowspec": "./dist/run.js" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./cli": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests",
    "dev": "tsx src/run.ts --help"
  },
  "dependencies": {
    "@flowspec/domain": "workspace:*",
    "@flowspec/lock": "workspace:*",
    "@flowspec/registry": "workspace:*",
    "@flowspec/server": "workspace:*",
    "@flowspec/ai": "workspace:*",
    "commander": "^14.0.1",
    "zod": "^4.1.12",
    "yaml": "^2.8.3"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "^3.2.4",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "lib": ["ES2022","DOM"],
    "noUnusedLocals": false,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/domain" },
    { "path": "../../packages/lock" },
    { "path": "../../packages/registry" },
    { "path": "../../packages/server" },
    { "path": "../../packages/ai" }
  ]
}
```

- [ ] **Step 3: 拷贝源码**

```bash
mkdir -p apps/cli/src/commands
cp packages/core/src/cli/run.ts apps/cli/src/run.ts
cp packages/core/src/cli/index.ts apps/cli/src/index.ts
cp packages/core/src/cli/daemon.ts apps/cli/src/daemon.ts
cp packages/core/src/cli/commands/*.ts apps/cli/src/commands/
cp packages/core/src/cli/commands.test.ts apps/cli/src/
```

- [ ] **Step 4: 调整 run.ts 与 daemon.ts**

`apps/cli/src/run.ts` 顶部添加 shebang（可选，package.json bin 会处理）：

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { flowSpecCommandDefs } from './commands/index.js';
// ... rest unchanged
```

`apps/cli/src/daemon.ts`:

```ts
// before
import { createPreviewServer } from '../preview/server.js';
import * as path from 'node:path';
// after
import { createPreviewServer } from '@flowspec/server';
```

检查 `apps/cli/src/commands/serve.ts` 中 spawn 逻辑：

原：
```ts
const thisFile = fileURLToPath(import.meta.url);
// ... daemonPath = path.resolve(...)
spawn(..., ['--import','tsx',daemonPath] ...)
```

新：通过自定位，无需硬编码 core 路径，保持 `fileURLToPath(import.meta.url)` 定位 `daemon.js`：

```ts
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
const thisFile = fileURLToPath(import.meta.url);
const daemonPath = path.resolve(path.dirname(thisFile), './daemon.js');
// 或直接 import '@flowspec/server' 启动，不 spawn 文件
```

确保 `shared.ts` 中动态 `await import('../../registry/store.js')` 改为 `await import('@flowspec/registry')`，同理 `await import('../../preview/server.js')` 改为 `@flowspec/server`。

- [ ] **Step 5: 重写全部跨包 import**

批量替换 `apps/cli/src` 下：

- `from '../../domain/...'` -> `@flowspec/domain`
- `from '../../lock/...'` -> `@flowspec/lock`
- `from '../../registry/...'` -> `@flowspec/registry`
- `from '../../preview/...'` -> `@flowspec/server`
- `from '../domain/...'` -> `@flowspec/domain`

示例 `apps/cli/src/commands/add.ts`:

```ts
import { flowSpecSchema } from '@flowspec/domain';
import { parseFlowSpecFromMarkdown } from '@flowspec/domain';
import { ensureRegistryDir } from '@flowspec/registry';
import { addEntry, loadMark, loadPreview } from '@flowspec/registry';
```

- [ ] **Step 6: 验证**

```bash
pnpm install
pnpm --filter flowspec build
pnpm --filter flowspec typecheck
pnpm --filter flowspec test
node apps/cli/dist/run.js --help
```

预期：CLI 帮助输出，`commands.test.ts` 中涉及 `loadMark` 的测试通过（需更新 import 路径为 @flowspec/registry）。

- [ ] **Step 7: Commit**

```bash
git add apps/cli
git commit -m "feat(cli): scaffold apps/cli from core/cli"
```

---

### Task 9: Migrate apps/web to fine-grained deps

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/src/App.tsx` (若引用 core)
- Modify: `apps/web/src/hooks/*`, `apps/web/src/components/*`, `apps/web/src/store/*`

**Interfaces:**
- Consumes: `@flowspec/domain`, `@flowspec/store`, `@flowspec/web`, `@flowspec/lock`, `@flowspec/registry`
- Produces: Vite SPA

- [ ] **Step 1: 更新 package.json dependencies**

从：

```json
"@flowspec/core": "workspace:*"
```

改为：

```json
"@flowspec/domain": "workspace:*",
"@flowspec/lock": "workspace:*",
"@flowspec/registry": "workspace:*",
"@flowspec/store": "workspace:*",
"@flowspec/web": "workspace:*",
"@flowspec/server": "workspace:*",
"@flowspec/ai": "workspace:*"
```

保持其他 `react`, `@xyflow/react` 等不变。

- [ ] **Step 2: 更新 tsconfig.json paths**

原：

```json
"paths": {
  "@flowspec/core": ["../../packages/core/src/index.ts"],
  "@flowspec/core/*": ["../../packages/core/src/*"]
}
```

新：移除 paths hack（workspace 解析），或改为按需：

```json
"paths": {}
```

或保留辅助但指向新包：

```json
"paths": {
  "@flowspec/domain": ["../../packages/domain/src/index.ts"],
  "@flowspec/store": ["../../packages/store/src/index.ts"]
}
```

推荐直接移除，依赖 `pnpm` 链接的 `dist`，或保留 `baseUrl` 仅用于 IDE。

- [ ] **Step 3: 重写 src 中 import**

全局替换 `apps/web/src`：

- `from '@flowspec/core'` -> `@flowspec/domain` 或 `@flowspec/store` 按需
- `from '@flowspec/core/web'` -> `@flowspec/web`
- `from '@flowspec/core/store'` -> `@flowspec/store`
- `from '@flowspec/core/lock'` -> `@flowspec/lock`
- `from '@flowspec/core/domain'` -> `@flowspec/domain`

示例 `apps/web/src/App.tsx`:

```ts
// before
import { FlowMapCanvas } from '@flowspec/core/web';
import { useFlowSpecStore } from '@flowspec/core/store';
// after
import { FlowMapCanvas } from '@flowspec/web';
import { useFlowSpecStore } from '@flowspec/store';
```

检查 `apps/web/src/hooks/useFlowSync.ts`, `useFlowActions.ts` 等是否导入 `domain` 类型，需同步。

- [ ] **Step 4: 检查 vite.config.ts proxy**

保持不变，确认 `process.env.FLOW_PREVIEW_API ?? 'http://127.0.0.1:5176'` 与 `@flowspec/server` 默认端口一致。

- [ ] **Step 5: 验证**

```bash
pnpm install
pnpm --filter @flowspec/web typecheck
pnpm --filter @flowspec/web build
```

预期：`apps/web/dist` 重新生成，`tsc` 无错误，`vite build` 产物包含 `assets/index-*.js`。

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/src
git commit -m "refactor(web): migrate apps/web to fine-grained @flowspec/*"
```

---

### Task 10: Root workspace cleanup & verification

**Files:**
- Modify: `package.json` (root scripts)
- Modify: `pnpm-workspace.yaml` (确认)
- Modify: `README.md`
- Modify: `tsconfig.base.json` (可选 references)
- Delete: `packages/core` (整个目录)

**Interfaces:**
- Consumes: 所有 packages/apps
- Produces: 可工作的 monorepo

- [ ] **Step 1: 更新根 package.json scripts**

原：

```json
"scripts": {
  "dev": "pnpm --filter @flowspec/web dev",
  "build": "pnpm --filter @flowspec/core build && pnpm --filter @flowspec/web build",
  "typecheck": "pnpm --filter @flowspec/core typecheck && pnpm --filter @flowspec/web typecheck",
  "test": "pnpm --filter @flowspec/core test",
  "cli": "pnpm --filter @flowspec/core exec flowspec",
  "serve": "pnpm --filter @flowspec/core exec node ./dist/cli/daemon.js",
  "preview:build": "pnpm --filter @flowspec/web build"
}
```

改为：

```json
"scripts": {
  "dev": "pnpm --filter @flowspec/web dev",
  "build": "pnpm -r build",
  "typecheck": "pnpm -r typecheck",
  "test": "pnpm --filter @flowspec/domain test && pnpm --filter @flowspec/registry test && pnpm --filter @flowspec/lock test && pnpm --filter flowspec test",
  "cli": "pnpm --filter flowspec exec flowspec",
  "serve": "pnpm --filter flowspec exec node ./dist/run.js",
  "preview:build": "pnpm --filter @flowspec/web build"
}
```

- [ ] **Step 2: 确认 pnpm-workspace.yaml**

```yaml
packages:
  - packages/*
  - apps/*
```

无需改动，但需验证 `packages/domain` 等被识别（`pnpm list --depth=-1`）。

- [ ] **Step 3: 删除 packages/core**

```bash
rm -rf packages/core
# 或 git rm -r packages/core
```

删除后检查无残留引用：

```bash
grep -r "@flowspec/core" --include="*.json" --include="*.ts" --include="*.md" | grep -v ".git" | grep -v "docs/superpowers"
```

应仅在历史 commit 或已更新的 docs 中出现。

- [ ] **Step 4: 更新 README.md**

将 `packages/core — 领域/锁/...` 描述改为新结构列表：

```md
- `packages/domain` — FlowSpec schema & markdown
- `packages/lock` — file lock
- `packages/registry` — mark/preview registry
- `packages/store` — zustand store
- `packages/ai` — prompt kit
- `packages/web` — canvas UI
- `packages/server` — Fastify preview + routes
- `apps/cli` — flowspec CLI (bin)
- `apps/web` — Vite frontend
```

并更新快速开始中的 `pnpm --filter @flowspec/core` 命令为 `pnpm -r build` / `pnpm --filter flowspec exec flowspec`.

- [ ] **Step 5: 全量验证**

```bash
pnpm install
pnpm -r build          # 预期 7 packages + apps/cli + apps/web 均 build 成功
pnpm -r typecheck      # 无类型错误
pnpm --filter @flowspec/domain test
pnpm --filter @flowspec/registry test
pnpm --filter @flowspec/lock test
pnpm --filter flowspec test
pnpm --filter @flowspec/web build
node apps/cli/dist/run.js --help
node apps/cli/dist/run.js flow --help
```

额外手动：

```bash
pnpm --filter flowspec exec flowspec flow serve --dir ./flowspec --port 5176 &
curl http://127.0.0.1:5176/api/flow-spec/demo || echo "api check"
pnpm --filter flowspec exec flowspec flow stop --dir ./flowspec
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml README.md
git add -A
git commit -m "chore: remove packages/core, finalize workspace scripts"
```

---

### Task 11: Docs & Final Polish

**Files:**
- Modify: `docs/superpowers/specs/2026-08-30-monorepo-packages-apps-design.md` 状态更新
- Create: `packages/README.md` (可选，说明各包职责)
- Verify: `pnpm list` 输出

- [ ] **Step 1: 更新设计文档状态**

将 `docs/superpowers/specs/2026-08-30-monorepo-packages-apps-design.md` 顶部 `Status: Draft` 改为 `Status: Implemented`。

- [ ] **Step 2: 可选 packages 概览**

创建 `packages/README.md`：

```md
# Packages

- domain: FlowSpec 核心模型
- lock: 文件锁与 frontmatter
- registry: 注册表同步
- store: Zustand 状态
- ai: AI prompt
- web: React Flow 画布
- server: Fastify 预览服务
```

- [ ] **Step 3: 最终验证与推送准备**

```bash
git log --oneline -10
git status --porcelain
pnpm -r build && echo "build ok"
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-30-monorepo-packages-apps-design.md packages/README.md
git commit -m "docs: mark monorepo design as implemented"
```

---

## Self-Review Checklist

- [x] 覆盖 spec §4.1 全部 7 包与 2 Apps，无遗漏
- [x] DAG 依赖与 package.json workspace:* 一致，无循环
- [x] 每个 Task 包含真实可执行代码，无 TBD
- [x] CLI bin 与 server 静态路径迁移已在 Task 7/8 明确处理
- [x] 测试策略：domain/lock/registry/store/cli 均有 vitest，web 有 tsc+vite，server 有冒烟
- [x] 全局约束在头部声明，各 Task 默认遵守
