# E2E — Playwright + V-Cursor

> 端到端测试基于 Playwright，双 `webServer` 联动 `vite preview`（前端）与 `flow serve`（预览服务），配合 V-Cursor 可视化虚拟光标模拟真实用户轨迹。

## 本地运行

```bash
pnpm -r build              # 先构建所有包（CLI + web-app）
pnpm test:e2e              # 全量：pnpm -r build && pnpm exec playwright test
pnpm test:e2e --project=chromium --reporter=list   # 列出/过滤运行
pnpm exec playwright test --list --project=chromium # 仅列出用例
```

`playwright.config.ts:30-46` 配置了两个 `webServer`：

| 服务 | 命令 | 端口 | 说明 |
|------|------|------|------|
| `flow serve` | `pnpm --filter flowspec exec node ./dist/run.js flow serve --dir ./e2e/.tmp-flowspec --port 5176 --host 127.0.0.1` | `5176` | 预览 API / WS，`flowspecDir` 来自 fixtures 隔离目录 |
| `vite preview` | `pnpm --filter @flowspec/web-app exec vite preview --port 5174 --host 127.0.0.1 --strictPort` | `5174` | 前端静态预览，`baseURL=http://127.0.0.1:5174` |

`reuseExistingServer: !process.env.CI`，本地复用已启动服务，CI 强制新建；`retries: 2` 仅在 CI 生效。

报告：`playwright.config.ts:13-16` 同时输出 `html`（`playwright-report/`）与 `list`；本地查看：

```bash
pnpm test:e2e:report   # pnpm exec playwright show-report
```

## 调试与可视化

```bash
pnpm test:e2e:ui       # UI 模式：浏览器中单步、时间旅行、查看 trace
pnpm test:e2e:headed   # 有头模式：直接观察 V-Cursor 轨迹（mouse.move 分步）
pnpm test:e2e:debug    # 调试模式：Playwright Inspector
```

### 手动开启可视化光标

在浏览器地址后追加 `?vcursor=1`：

```
http://127.0.0.1:5174/?dir=/absolute/path/to/e2e/.tmp-flowspec&file=demo&workspace=e2e-test&vcursor=1
```

`previewUrlFor()`（`e2e/helpers/preview-server.ts`）会为用例自动拼接参数；手动访问时加 `?vcursor=1` 会挂载 `VCursorOverlay`（React）叠加层，即使不加，`VCursorHelper` 也会在 potřeb 时注入回退 DOM 叠加（`[data-testid="vcursor"]`）。

`CI` 环境下建议 `showCursor: false` 加速（`vCursor` 仅驱动 `page.mouse` 不做视觉同步）。

## `vCursor` API 速查

`e2e/helpers/v-cursor.ts:43` — `VCursorHelper` / 工厂 `vCursor(page, opts)`：

```ts
import { vCursor } from './helpers/v-cursor.js';
const vc = vCursor(page); // 或 vCursor(page, { steps: 25, delayMs: 32, showCursor: true })
```

| 方法 | 签名 | 说明 |
|------|------|------|
| `moveTo` | `moveTo(locator \| {x,y}, opts?) => Promise<Pos\|null>` | 分 `steps`（默认 25）步插值 `page.mouse.move`，每步 `delayMs`（默认 32ms）+ 同步 `__VCURSOR__` 覆盖层；`boundingBox` 为空时回退 `getBoundingClientRect` / `locator.click()` |
| `click` | `click(locator, opts?)` | `moveTo` → `syncVisual(active:true)` → `mouse.down/up`，失败回退 `locator.click()` |
| `dblclick` | `dblclick(locator, opts?)` | 双击；`showCursor:false` 时直接 `locator.dblclick()` |
| `hover` | `hover(locator, opts?)` | `moveTo` + 短暂标签停留 |
| `drag` | `drag(from, to, opts?)` | `moveTo(from)` → `mouse.down` → 插值移动到 `to` → `mouse.up`；任一端解析失败回退 `from.dragTo(to)` |
| `type` | `type(locator, text, {delay}? & opts?)` | `click` 聚焦 → `pressSequentially(text,{delay:32})`，失败回退 `fill` / `keyboard.type` |
| `wheel` | `wheel(deltaY, opts?)` | `mouse.wheel(0, deltaY)` |
| `press` | `press(key, opts?)` | `keyboard.press(key)` |
| `vCursor(page, opts?)` | 工厂 | 返回 `VCursorHelper` 实例；`opts.showCursor===false` 时跳过注入、仅原生动作（CI 加速） |

`VCursorOptions`:

```ts
type VCursorOptions = { steps?: number; delayMs?: number; label?: string; showCursor?: boolean }
```

注入机制：`ensureCursorInjected()` 通过 `page.evaluate` 保证 `window.__VCURSOR__`（含 `set`/`get` + `__vcursor:update` 事件）存在，并通过 `page.addInitScript` 在后续导航中自动重建；当 `?vcursor=1` 时由前端 `VCursorOverlay` 订阅事件，否则 `ensureCursorInjected` 注入回退 DOM 节点 `[data-testid="vcursor"]` / `[data-testid="vcursor-dot"]`。

## 临时目录隔离

`e2e/helpers/tmp-dir.ts:12` — `prepareFlowspecDir(prefix?)`:

- 基目录：`e2e/.tmp-flowspec/`（已在 `.gitignore:18` 忽略）
- 每次调用创建 `e2e/.tmp-flowspec/<prefix>-<timestamp>-<rand>/`，拷贝 `flowspec/demo.md`（若不存在则回退 `e2e/fixtures/flowspec-sample.md`）为 `demo.md`
- `e2e/fixtures.ts:11-15` 将其暴露为 `flowspecDir` fixture，`test` 结束后自动 `rm -rf` 该子目录（`cleanup()`）；仅在异常中断时可能残留，可安全手动删除整个 `e2e/.tmp-flowspec/`
- `previewUrlFor(flowspecDir, file, workspace)` 将 `flowspecDir` 绝对路径写入 `?dir=` 供 `flow serve` 解析；`waitForPreviewReady(baseURL, flowspecDir)` 轮询 `/api/flow-spec/full?dir=...` 直到后端就绪

## pnpm 约束

本仓库强制 `pnpm@10.33.0`（`packageManager` 字段），所有命令使用 `pnpm --filter` / `pnpm -r` / `pnpm exec`，禁用 `npx`/`yarn`/`pnpm dlx`。CI 中同样使用 `pnpm exec playwright ...`。

## CI

见 `.github/workflows/e2e.yml`：在 `push: main` 与所有 `pull_request` 触发，步骤为 `pnpm install` → `pnpm -r build` → `pnpm exec playwright install --with-deps chromium` → `pnpm test:e2e:ci`（`--reporter=html,list --project=chromium`），产物 `playwright-report/` 通过 `actions/upload-artifact@v4` 上传（`if: always()`）。

## 目录结构

```
e2e/
  fixtures.ts          # flowspecDir + previewUrl fixtures（tmp dir 生命周期）
  tsconfig.json
  fixtures/            # flowspec-sample.md 回退样例
  helpers/
    tmp-dir.ts         # prepareFlowspecDir
    preview-server.ts  # previewUrlFor / waitForPreviewReady
    v-cursor.ts        # VCursorHelper
    flow-utils.ts
  page-objects/
    app.page.ts        # AppPage 封装导航/画布/编辑交互
  specs/
    navigation.spec.ts
    canvas-interaction.spec.ts
    node-edit.spec.ts
    lock.spec.ts       # 共约 8 用例（chromium 单项目）
```
