# Playwright E2E 验证基础设施与 V-Cursor 模拟输入 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All commands MUST use `pnpm` (never npm/yarn/npx — use `pnpm dlx` / `pnpm exec`).

**Goal:** 为 `flowspec` 建立基于 `pnpm + @playwright/test` 的 E2E 验证基础设施，提供可视化 `V-Cursor` 虚拟光标模拟真实用户输入（移动/点击/拖拽/键入/滚轮），并覆盖核心链路（导航/画布/编辑/锁）达到可一键 `pnpm test:e2e` 本地与 CI 稳定运行。

**Architecture:** 根 `playwright.config.ts` 统一编排，前后端双 `webServer`（`@flowspec/server` 预览服务 `:5176` + `@flowspec/web-app` 预览 `:5174` 的 `vite preview` 产物），`e2e/` 层封装 `fixtures` + `v-cursor` 助手 + `preview-server` 生命周期，`packages/web/src/components/VCursor.tsx` 提供 DEV 可视化叠加层，`e2e/specs/*.spec.ts` 按页面对象组织。

**Tech Stack:** pnpm 10.33 workspace, TypeScript 5.9, Playwright 1.62 (@playwright/test), Vite 7 preview, Fastify preview server, React 19, Zustand

## Global Constraints

- 必须 `pnpm`：`packageManager: pnpm@10.33.0`，`pnpm-workspace.yaml` 含 `packages/*, apps/*`，所有安装/执行用 `pnpm add -D -w` / `pnpm --filter` / `pnpm exec` / `pnpm dlx`，禁止 `npx`/`npm`/`yarn`
- TS 严格：`playwright.config.ts` 与 `e2e/**/*.ts` 需通过 `pnpm exec tsc --noEmit`（或 `pnpm typecheck` 包含时）无错误；`e2e/tsconfig.json` 需 `composite`/`references` 合法
- Playwright 固定 `chromium` 单浏览器，`fullyParallel: true`，`retries: 0`（CI 2），`trace: on-first-retry`，`screenshot: only-on-failure`，`video: retain-on-failure`
- V-Cursor 必须可视化：提供 DOM 叠加层（`VCursor.tsx`）与 Playwright 助手（`e2e/helpers/v-cursor.ts`）双实现，支持 `moveTo`/`click`/`dblclick`/`drag`/`type`/`hover`/`wheel` 且轨迹分步（steps）与打字节奏（delay）可配置，默认 `steps: 25, delay: 32ms`
- webServer 必须复用 `pnpm -r build` 产物：`apps/web` 用 `pnpm --filter @flowspec/web-app exec vite preview --port 5174 --strictPort`，`@flowspec/server` 需 `previewDistDir` 指向 `apps/web/dist`
- 所有 E2E 用例必须隔离：每个测试前 `prepareFlowspecDir` 创建临时 `flowspec/` 目录（copy fixture），测试后清理，不污染 `flowspec/` 真实文件
- CI 就绪：`pnpm test:e2e` 一键可跑，`playwright.config.ts` 需 `reporter: [['html', {open:'never'}], ['list']]`，产物 `playwright-report`/`test-results` gitignored

---

### Task 1: Playwright 根基与 pnpm 脚本

**Files:**
- Modify: `package.json`（根 scripts + devDeps）
- Modify: `pnpm-workspace.yaml`（如需）
- Create: `playwright.config.ts`
- Create: `e2e/tsconfig.json`
- Create: `.gitignore` 增量（如需）
- Modify: `tsconfig.base.json`（如需 references）

**Interfaces:**
- Consumes: 现有 `pnpm -r build` 产物，`apps/web/dist`，`apps/cli/dist`
- Produces: `playwright.config.ts` 配置，`pnpm test:e2e` 等脚本，`@playwright/test` 安装

- [ ] **Step 1: 安装 Playwright（pnpm）**

```bash
pnpm add -D -w @playwright/test@1.62.1
pnpm add -D -w playwright@1.62.1
pnpm exec playwright install --with-deps chromium
```

验证：

```bash
pnpm exec playwright --version  # 1.62.x
ls node_modules/.bin/playwright
```

- [ ] **Step 2: 创建 e2e/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "../dist-e2e",
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@playwright/test"],
    "lib": ["ES2022", "DOM"],
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["**/*.ts"],
  "references": []
}
```

- [ ] **Step 3: 创建 playwright.config.ts（根）**

要求：
- `import { defineConfig, devices } from '@playwright/test'`
- `testDir: './e2e'`, `testMatch: '**/*.spec.ts'`
- `timeout: 30_000`, `expect.timeout: 10_000`
- `fullyParallel: true`, `workers: process.env.CI ? 2 : 4`
- `retries: process.env.CI ? 2 : 0`
- `reporter: [['html', { open: 'never' }], ['list']]`
- `use: { baseURL: 'http://127.0.0.1:5174', trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure', actionTimeout: 10_000 }`
- `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]`
- `webServer: [{ command: 'pnpm --filter flowspec exec node ./dist/run.js flow serve --dir ./e2e/.tmp-flowspec --port 5176 --host 127.0.0.1', port: 5176, reuseExistingServer: !process.env.CI, timeout: 30_000, stdout: 'pipe' }, { command: 'pnpm --filter @flowspec/web-app exec vite preview --port 5174 --host 127.0.0.1 --strictPort', port: 5174, reuseExistingServer: !process.env.CI, timeout: 30_000 }]` — 若 `reuseExistingServer` 导致端口占用，`port` 需 `strictPort` 且 fallback 到 `5175` 的备选逻辑在 helper 中处理
- `globalSetup` 留空（由 fixtures 接管临时目录）
- `outputDir: 'test-results'`

示例骨架：

```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm --filter @flowspec/web-app exec vite preview --port 5174 --host 127.0.0.1 --strictPort', port: 5174, reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: 'pnpm --filter flowspec exec node ./dist/run.js flow serve --dir ./e2e/.tmp-flowspec --port 5176 --host 127.0.0.1', port: 5176, reuseExistingServer: !process.env.CI, timeout: 30000 }
  ]
});
```

注意：若 `flow serve` 暂不支持 `--host`，需在 `packages/server` 中确认或回退到 `127.0.0.1` 默认。

- [ ] **Step 4: 根 package.json scripts 增量**

```json
{
  "scripts": {
    "test:e2e": "pnpm -r build && pnpm exec playwright test",
    "test:e2e:ui": "pnpm exec playwright test --ui",
    "test:e2e:debug": "pnpm exec playwright test --debug",
    "test:e2e:report": "pnpm exec playwright show-report",
    "test:e2e:headed": "pnpm exec playwright test --headed"
  }
}
```

保持现有 `typecheck/build/lint` 不变。

- [ ] **Step 5: .gitignore 增量**

追加（若不存在）：

```
/test-results/
/playwright-report/
/playwright/.cache/
e2e/.tmp-flowspec/
dist-e2e/
```

- [ ] **Step 6: 验证**

```bash
pnpm typecheck  # 或 pnpm exec tsc --noEmit
pnpm exec playwright test --list  # 此时 0 tests 但配置合法
pnpm --filter @flowspec/web-app build
pnpm exec playwright test --project=chromium --reporter=list  # dry-run
```

预期：无 TS 错误，`playwright.config.ts` 被识别，`pnpm exec playwright --version` 正常。

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts e2e/tsconfig.json .gitignore tsconfig.base.json
git commit -m "feat(e2e): playwright foundation with pnpm and dual webServer"
```

---

### Task 2: Fixtures 与 Preview Server 生命周期

**Files:**
- Create: `e2e/fixtures.ts`
- Create: `e2e/helpers/preview-server.ts`
- Create: `e2e/helpers/flow-utils.ts`
- Create: `e2e/helpers/tmp-dir.ts`
- Create: `e2e/fixtures/flowspec-sample.md`（最小可用 flowspec）

**Interfaces:**
- Consumes: `playwright.config.ts` 的 `baseURL`，`@flowspec/domain` 的 schema（可选校验），`apps/cli` 的 `flow serve` 能力
- Produces: `test`/`expect` 扩展（`fixtures.ts` 导出 `test` 含 `flowspecDir`/`previewUrl`），`prepareFlowspecDir`/`cleanupTmpDir`，`waitForPreviewReady`，`flow-utils` 的 `createFlow/startPreviewServer`

- [ ] **Step 1: 创建 e2e/helpers/tmp-dir.ts**

职责：

```ts
export async function prepareFlowspecDir(prefix = 'e2e'): Promise<{ dir: string; cleanup: () => Promise<void> }>
```

- 在 `e2e/.tmp-flowspec/<prefix>-<rand>` 创建临时目录
- 拷贝 `flowspec/demo.md` 或 `e2e/fixtures/flowspec-sample.md` 作为 `demo.md`
- 返回 `dir` 与 `cleanup`（`rm -rf`）
- 支持并发（随机后缀）

`cleanup` 需在 `test.afterEach` 调用，`prepare` 在 `test.beforeEach` 或 fixture 内部。

- [ ] **Step 2: 创建 e2e/helpers/preview-server.ts**

职责：

```ts
export async function waitForPreviewReady(baseURL: string, timeoutMs?: number): Promise<void>
export function previewUrlFor(dir: string, id?: string, holder?: string): string
```

- `waitForPreviewReady` 轮询 `GET /api/flow-spec/full?dir=...` 或 `GET /` 直到 200
- `previewUrlFor` 拼接 `?dir=...&id=demo&holder=e2e-test` 等查询，供 `page.goto`
- 若 `playwright.config.ts` 的 webServer 已启动，此 helper 仅作健康检查，不重复 spawn；若 `reuseExistingServer` 失效，提供 `startPreviewServer(dir, port)` 备用（spawn `pnpm --filter flowspec exec node ./dist/run.js flow serve ...`，返回 `child` 与 `stop`）

需处理端口占用：优先 `5176`，失败尝试 `5177`，并返回实际端口。

- [ ] **Step 3: 创建 e2e/helpers/flow-utils.ts**

职责：

```ts
export function flowspecSample(): string
export async function writeFlowspecFile(dir: string, name: string, content: string): Promise<string>
```

- `flowspecSample()` 返回最小合法 FlowSpec Markdown（包含 `---` frontmatter + `^^^node:demo:task:100:100` 等一行式 block，确保 `parseFlowSpecFromMarkdown` 可解析）
- `writeFlowspecFile` 写入 `dir/name.md`，供测试用例动态构造场景（锁、空 flowspec、复杂图）

提供 fixture `fixtures/flowspec-sample.md` 作为静态样板：

```md
---
id: demo
title: Demo
---

# Demo

^^^node:demo:branch:0:0
^^^node:n1:task:100:100
^^^edge:e1:dependency:n1:demo
```

- [ ] **Step 4: 创建 e2e/fixtures.ts（核心）**

```ts
import { test as base, expect } from '@playwright/test';
import { prepareFlowspecDir } from './helpers/tmp-dir.js';
import { previewUrlFor, waitForPreviewReady } from './helpers/preview-server.js';

type Fixtures = { flowspecDir: string; previewUrl: string };

export const test = base.extend<Fixtures>({
  flowspecDir: async ({}, use) => {
    const { dir, cleanup } = await prepareFlowspecDir();
    await use(dir);
    await cleanup();
  },
  previewUrl: async ({ flowspecDir }, use) => {
    await waitForPreviewReady('http://127.0.0.1:5174');
    await use(previewUrlFor(flowspecDir, 'demo', 'e2e-test'));
  }
});
export { expect };
```

要求：
- 每个 worker 独立 `flowspecDir`
- `previewUrl` 依赖 `flowspecDir`，自动等待前端与后端就绪
- 导出 `expect` 保持 `import { test, expect } from './fixtures.js'` 用法

- [ ] **Step 5: 验证**

```bash
pnpm -r build
pnpm exec playwright test --list
# 编写临时 smoke：e2e/smoke.fixtures.spec.ts（仅验证 fixtures 可创建目录并 goto）
pnpm exec playwright test e2e/smoke.fixtures.spec.ts --project=chromium --reporter=list
```

smoke 示例（验证后删除或保留为 sample）：

```ts
import { test, expect } from './fixtures.js';
test('fixtures smoke', async ({ page, previewUrl, flowspecDir }) => {
  expect(flowspecDir).toContain('e2e/.tmp-flowspec');
  await page.goto(previewUrl);
  await expect(page.locator('#root')).toBeVisible();
});
```

预期：目录创建/清理正常，`page.goto(previewUrl)` 可达 `加载中…` 或画布（取决于后端是否就绪）。

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures.ts e2e/helpers/ e2e/fixtures/ .gitignore
git commit -m "feat(e2e): fixtures and preview server lifecycle with tmp flowspec dir"
```

---

### Task 3: V-Cursor 虚拟光标（可视化模拟输入）

**Files:**
- Create: `packages/web/src/components/VCursor.tsx`
- Create: `packages/web/src/components/VCursor.css`（或 tailwind 内联样式）
- Create: `e2e/helpers/v-cursor.ts`
- Modify: `apps/web/src/App.tsx`（条件注入 VCursor 叠加层，`?vcursor=1` 或 `process.env.E2E` 时）
- Modify: `apps/web/src/main.tsx`（如需全局样式）

**Interfaces:**
- Consumes: `playwright` 的 `Page`/`Locator`，`packages/web` 的 React
- Produces: `VCursor` 组件（DEV/E2E 可视化），`VCursorHelper`（Playwright 侧，封装 `page.mouse` + 可视化注入）

- [ ] **Step 1: 创建 packages/web/src/components/VCursor.tsx**

要求：
- Props: `{ x: number; y: number; active?: boolean; label?: string; visible?: boolean }`
- 渲染：固定定位 `pointer-events:none` 的箭头/圆点（SVG 或 div），跟随 `x,y`，`active` 时缩放/发光，`label` 显示操作名
- 样式：`z-[9999]`，`transition: transform 80ms linear`，深浅主题兼容，`mix-blend-mode` 可选
- 额外：提供 `VCursorProvider`（可选）与 `useVCursor` hook，用于 `apps/web` 在 `?vcursor=1` 时全局挂载
- 单元可测：纯展示组件，无副作用

示例：

```tsx
export function VCursor({ x, y, active, label }: { x: number; y: number; active?: boolean; label?: string }) {
  return (
    <div style={{ left: x, top: y, position: 'fixed', pointerEvents: 'none', zIndex: 9999, transform: 'translate(-50%,-50%)' }}>
      <div className={`w-6 h-6 rounded-full border-2 ${active ? 'scale-110 bg-indigo-500/30' : 'bg-white/80'} shadow-lg`} />
      {label && <span className="ml-2 px-1.5 py-0.5 text-xs bg-zinc-900 text-white rounded">{label}</span>}
    </div>
  );
}
```

- [ ] **Step 2: apps/web 注入 VCursor（条件渲染）**

在 `App.tsx`:

```tsx
const showVCursor = new URLSearchParams(window.location.search).get('vcursor') === '1';
{showVCursor && <VCursor x={cursor.x} y={cursor.y} active={cursor.active} label={cursor.label} />}
```

或通过 `useVCursorStore`（zustand）全局管理，由 `e2e/helpers/v-cursor.ts` 通过 `page.evaluate` 驱动坐标。

更优：`v-cursor.ts` 在 `page` 端注入 `window.__VCURSOR__ = { set(pos) }`，`VCursor` 订阅该全局。

- [ ] **Step 3: 创建 e2e/helpers/v-cursor.ts（核心）**

API 设计（全部 `async`，默认可视化轨迹）：

```ts
export type VCursorOptions = { steps?: number; delayMs?: number; label?: string; showCursor?: boolean };

export class VCursorHelper {
  constructor(private page: Page, private opts: VCursorOptions = {}) {}
  async moveTo(locatorOrPos: Locator | { x: number; y: number }, opts?: VCursorOptions): Promise<{x:number,y:number}>;
  async click(locator: Locator, opts?: VCursorOptions): Promise<void>;
  async dblclick(locator: Locator, opts?: VCursorOptions): Promise<void>;
  async hover(locator: Locator, opts?: VCursorOptions): Promise<void>;
  async drag(from: Locator, to: Locator, opts?: VCursorOptions): Promise<void>;
  async type(locator: Locator, text: string, opts?: VCursorOptions & { delay?: number }): Promise<void>;
  async wheel(deltaY: number, opts?: VCursorOptions): Promise<void>;
  async press(key: string, opts?: VCursorOptions): Promise<void>;
}
export function vCursor(page: Page, opts?: VCursorOptions): VCursorHelper;
```

实现要点：
- `moveTo`：获取 `locator.boundingBox()` 中心点，若传入坐标直接使用；通过 `page.mouse.move(x, y, { steps })` 分步移动，每步 `delayMs`（默认 25 步、32ms），同时 `page.evaluate` 更新 `window.__VCURSOR__` 使 `VCursor.tsx` 叠加层同步
- `click`：`moveTo` + `page.mouse.down`/`up`，期间 `active=true` 高亮
- `drag`：`moveTo(from)` → `mouse.down` → 分步 `mouse.move(to)` → `mouse.up`
- `type`：`click` 聚焦 → `locator.pressSequentially(text, { delay: 32 })`，同时触发光标跳动
- `wheel`：`page.mouse.wheel(0, deltaY)`
- `showCursor` false 时仅执行 `page` 原生操作（用于 CI 无头加速）
- 注入逻辑：`page.addInitScript(() => { window.__VCURSOR__ = ... })` 或 `page.evaluate` 动态注入，确保 `?vcursor=1` 或自动注入均可

需处理 `boundingBox` null 的 fallback（`locator.click()` 直连）。

- [ ] **Step 4: 提供便捷 PageObject 基类（可选）**

```ts
export class AppPage {
  constructor(public page: Page, public cursor = vCursor(page)) {}
  gotoFlowspec(url: string) { return this.page.goto(url); }
  get canvas() { return this.page.locator('.react-flow, [data-testid="flow-canvas"]'); }
  get nodeDetail() { return this.page.locator('[data-testid="node-detail"]'); }
}
```

供 specs 复用。

- [ ] **Step 5: 验证**

```bash
pnpm --filter @flowspec/web build
pnpm -r build
# 编写 e2e/v-cursor.smoke.spec.ts
pnpm exec playwright test e2e/v-cursor.smoke.spec.ts --project=chromium --headed --reporter=list
```

smoke 示例：

```ts
import { test, expect } from './fixtures.js';
import { vCursor } from './helpers/v-cursor.js';
test('v-cursor moves and clicks', async ({ page, previewUrl }) => {
  await page.goto(previewUrl + '&vcursor=1');
  const cursor = vCursor(page, { steps: 20, delayMs: 20 });
  await cursor.moveTo({ x: 200, y: 200 });
  await cursor.click(page.locator('#root'));
  await expect(page.locator('#root')).toBeVisible();
});
```

预期： headed 模式下可见光标平滑移动、点击高亮；headless 下操作仍通过（`showCursor: false` 时仅原生事件）。

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/VCursor.tsx e2e/helpers/v-cursor.ts apps/web/src/App.tsx
git commit -m "feat(e2e): v-cursor virtual cursor with visual overlay and playwright helper"
```

---

### Task 4: 核心 E2E 用例（导航/画布/编辑/锁）

**Files:**
- Create: `e2e/specs/navigation.spec.ts`
- Create: `e2e/specs/canvas-interaction.spec.ts`
- Create: `e2e/specs/node-edit.spec.ts`
- Create: `e2e/specs/lock.spec.ts`
- Create: `e2e/page-objects/app.page.ts`（如 Task 3 未创建）

**Interfaces:**
- Consumes: `e2e/fixtures.ts` 的 `test`/`expect`，`v-cursor.ts` 的 `vCursor`，`flow-utils.ts`
- Produces: 四组 spec，覆盖核心用户旅程，CI 稳定

- [ ] **Step 1: navigation.spec.ts**

用例：
- `should load app and show flow list`：`goto previewUrl` → `expect(page.locator('text=FlowSpec'))` 或 `LeftNav` 的 flow 名称可见
- `should switch flow via LeftNav`：`vCursor.click` 切换 flow 列表项 → `expect(page.locator('[data-testid="flow-title"]'))` 变化

需为 `LeftNav`/`FlowAside` 添加 `data-testid`（如缺失，在 `packages/web` 中补）。

- [ ] **Step 2: canvas-interaction.spec.ts**

用例：
- `should render canvas with nodes`：等待 `.react-flow__node` ≥1，`vCursor.hover` 节点显示 tooltip/高亮
- `should drag node and persist`：`vCursor.drag` 节点 → 坐标变化 → `page.waitForTimeout(500)` → 触发 `rfToFlowSpec` 同步（检查 `wsSend` 或 `fetch` mock）→ 可选验证 `flowspecDir/demo.md` 文件中 `x:y` 更新

需 `canvas` 有稳定选择器：`[data-testid="flow-canvas"]` 或 `.react-flow`.

- [ ] **Step 3: node-edit.spec.ts**

用例：
- `should open node detail and edit via v-cursor`：`vCursor.click` 节点 → `expect(nodeDetail).toBeVisible()` → `vCursor.click` 编辑按钮 → `vCursor.type` 输入新标题 → 保存 → `expect(page.locator('text=新标题'))` 可见
- `should edit markdown via BlockNote and persist`：进入 `NodeDetail` 的 `BlockMarkdownEditor`，`vCursor.type` 追加 `^^^node:new:task:0:0` 或直接文本 → 保存 → 验证 `previewUrl` 刷新后内容仍在

需 `NodeDetail`/`BlockMarkdownEditor` 暴露 `data-testid="node-detail"`, `data-testid="block-editor"`.

- [ ] **Step 4: lock.spec.ts**

用例：
- `should show lock banner when locked`：预先 `writeFlowspecFile(dir, 'demo.md', contentWithLock)` 写入 `locked: true` frontmatter → `goto` → `expect(page.locator('text=操作中已锁定'))` 可见
- `should allow editing when owned`：`holder=e2e-test` 且 `locked.holder` 一致 → `expect(page.locator('text=编辑中已锁定'))` → 可编辑

利用 `flow-utils.ts` 的 `writeFlowspecFile` 动态构造锁场景。

- [ ] **Step 5: 稳定性加固**

- 每个 spec 前 `await page.goto(previewUrl + '&vcursor=1')` 并 `waitForPreviewReady`
- 关键等待用 `expect(locator).toBeVisible({ timeout: 10_000 })` 而非 `waitForTimeout` 硬编码（除拖拽后 500ms  debounce 例外）
- `vCursor` 默认 `steps: 25`，CI 时 `showCursor: false` 加速（通过 `process.env.CI` 判断）
- 为 flaky 的 `canvas drag` 增加 `retry: 1`（spec 级别 `test.describe.configure`）

- [ ] **Step 6: 验证**

```bash
pnpm -r build
pnpm exec playwright test e2e/specs --project=chromium --reporter=list
pnpm exec playwright test --project=chromium  # 全量
```

预期：本地 4 文件 × 2-3 用例 ≈ 8-10 用例全绿；`--headed` 下可见 V-Cursor 轨迹。

- [ ] **Step 7: Commit**

```bash
git add e2e/specs/ e2e/page-objects/ packages/web/src/components/VCursor.tsx
git commit -m "feat(e2e): core specs for navigation, canvas, node edit and lock"
```

---

### Task 5: CI、报告与文档

**Files:**
- Modify: `package.json`（新增 `test:e2e:ci`）
- Create: `.github/workflows/e2e.yml`（如 `.github` 存在则增量）
- Modify: `README.md`（E2E 章节）
- Modify: `.gitignore`（如 Task1 未全）
- Create: `e2e/README.md`

**Interfaces:**
- Consumes: 前四任务的产物
- Produces: CI 一键绿、本地 `pnpm test:e2e` 报告、文档

- [ ] **Step 1: 根 package.json 增补 CI 脚本**

```json
{ "scripts": { "test:e2e:ci": "pnpm -r build && pnpm exec playwright test --reporter=html,list --project=chromium" } }
```

- [ ] **Step 2: GitHub Workflow**

` .github/workflows/e2e.yml`:

```yaml
name: e2e
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10.33.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install
      - run: pnpm -r build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e:ci
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: playwright-report, path: playwright-report/ }
```

- [ ] **Step 3: e2e/README.md**

说明：
- `pnpm test:e2e` 本地运行（含 `vite preview` 与 `flow serve` 双 webServer）
- `pnpm test:e2e:ui` 可视化调试，`pnpm test:e2e:headed` 观察 V-Cursor
- `?vcursor=1` 手动开启可视化光标
- `vCursor` API 速查表（`moveTo/click/drag/type`）
- 临时目录隔离说明（`e2e/.tmp-flowspec` 自动清理）

- [ ] **Step 4: README.md 根增量**

在 `质量门禁` 后追加：

```md
## E2E

```bash
pnpm test:e2e          # 全量
pnpm test:e2e:ui        # UI 模式
pnpm test:e2e:headed    # 观察 V-Cursor 轨迹
```

详见 `e2e/README.md`。
```

- [ ] **Step 5: 验证**

```bash
pnpm typecheck
pnpm test:e2e --project=chromium --reporter=list  # 或 --list
pnpm exec playwright test --project=chromium --reporter=list
```

预期：`pnpm typecheck` 通过，`e2e` 约 8 用例可列出，CI 配置 `pnpm dlx` 风格（如有）仅用 `pnpm exec`.

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/e2e.yml e2e/README.md README.md .gitignore
git commit -m "chore(e2e): CI, reporting and docs for playwright v-cursor"
```

---

## Self-Review Checklist

- [x] 覆盖 Playwright 根基（config + pnpm scripts）、Fixtures（tmp dir + preview lifecycle）、V-Cursor（组件 + helper + 注入）、核心 Specs（4 文件）、CI/Docs，无遗漏
- [x] pnpm 全局约束在头部，task 内禁用 npx/yarn，webServer 命令显式 `pnpm --filter`
- [x] V-Cursor 双实现（DOM 叠加 + Playwright 轨迹分步/打字节奏）且 `?vcursor=1` 可切换，满足“模拟用户输入”可视化要求
- [x] 每个 Task 包含真实可执行代码与验证命令，无 TBD，文件路径与接口精确
- [x] 隔离性与稳定性：临时 flowspec 目录、data-testid、expect 超时、CI 重试均明确

