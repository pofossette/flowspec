---
locked: false
holder: web:roadmap
lockReason: roadmap planning
version: 1.0.0
rootId: root-roadmap
title: TrapMap 后续演进路线 — 模块化收敛与闭环
createdAt: 2026-08-30T14:00:00.000Z
updatedAt: 2026-08-30T14:00:00.000Z
---

# TrapMap 后续演进路线 — 模块化收敛与闭环

> 文档为本体，图谱为导航：左侧多标签切换 `preview.json` 中记录的 flowspec，点击节点即阅读章节原文

^^^block
type: node
id: root-roadmap
kind: root
label: 后续演进路线
status: doing
x: 0
y: 0
color: indigo
bgColor: "#eef2ff"
icon: Rocket
---
# 文档本体 — 点击即阅读

> **本质：md 文档为本体，`^^^block` 为块标识**。本文件是下一阶段的真·规划，图谱仅作导航。

## 北极星
- 检索 P99 < 300ms 且命中率 ≥ 0.92 在增量编译下不漂移
- `pnpm check:asserts 0` `pnpm typecheck 0` `74/74` 常绿
- 单文件 ≤300 行约束成为 CI 门禁而非人工约束

## 阅读方式
左侧 `LeftNav/FlowTabs` 多标签即 `GET /api/flow-spec?dir=flowspec` 对 `preview.json` 的映射；点击节点看实现方案，边看“如何到达”。

^^^
^^^block
type: node
id: b-debt
kind: branch
label: 架构债务收敛
status: doing
color: "#4338ca"
x: 240
y: 100
---
## §1 架构债务收敛

> 来自 Task 2/3 最终评审的延期项，需在下一迭代清零。

- `registry→lock` 原子 helper 耦合
- `ws.ts` SSE 错位
- `flow-spec-routes.ts 284/300` 临界
- `apps/flow-preview` 1.6MB 拆包

^^^
^^^block
type: node
id: b-retrieval
kind: branch
label: 检索与摘要闭环
status: todo
color: "#6366f1"
x: 520
y: 100
---
## §2 检索与摘要闭环

- v4 graph-assisted 召回调参（graphDepth、score 融合）
- eval smoke → 全量回归
- TrapMap 插入稳定性（502 兜底、token 透传）

^^^
^^^block
type: node
id: b-dx
kind: branch
label: 工程体验打磨
status: todo
color: "#0ea5e9"
x: 240
y: 360
---
## §3 工程体验打磨

- `flow serve --debug` 守护与 `flow stop` 稳定性（PID、stale、800ms 探测）
- 多标签持久化（activeId → URL + localStorage）
- showcase → 模板库（roadmap、RFC、ADR 三件套）

^^^
^^^block
type: node
id: b-govern
kind: branch
label: 治理与可观测性
status: todo
color: "#14b8a6"
x: 520
y: 360
---
## §4 治理与可观测性

- `flowSpecSchema` 前后端双校验收紧（useFlowSync 已加 safeParse，需推广至 PUT）
- `check:asserts` 与落盘原子性纳入 deployment-smoke
- 服务发现/健康检查与可观测性配置契约对齐

^^^
^^^block
type: node
id: t-atomic
kind: task
label: 原子写提升至 @trapmap/lib
status: todo
x: 120
y: 200
---
## §1.1 原子写提升至 @trapmap/lib

**Why**：`registry/helpers.ts:4 → lock/helpers.ts:13` 形成 `registry→lock` 单向依赖，违 `BOUNDARIES` 严格 zone 隔离。评审 I1 已延期。

**What**：
- 新建 `packages/lib/src/fs-atomic.ts` 导出 `tmpPath/atomicWriteFileSync/atomicRename`
- `lock/helpers.ts` 与 `registry/helpers.ts` 均 `import from @trapmap/lib`
- 补 `lib` 单测 `fs-atomic.test.ts` 覆盖 `tmp.${pid}.${uuid}+renameSync` 原子性

**Done**：`pnpm exec fallow audit --boundaries` 0 违规，`registry/store.ts 206/250` 不动。

^^^
^^^block
type: node
id: t-sse
kind: task
label: SSE 归位与 lock 拆分
status: todo
x: 360
y: 200
---
## §1.2 SSE 归位与 lock 拆分

**Why**：`ws.ts:24 GET /api/flow-spec/:id/watch` SSE 寄宿 WS 域，仅为保 `flow-spec-routes 284/300`。

**What**：
- 新 `preview/server/lock-routes.ts` 承载 `GET/POST/DELETE /api/flow-spec/:id/lock`
- `flow-spec-routes.ts` 收回 `GET :id/watch` SSE（600ms 轮询 + fs.watch）
- `helpers.ts` 保留 `resolveEffectiveDir/toApiError/broadcast`，`ws.ts` 仅 `WS /ws/...` + `Map<dir::id,Set>`

**Done**：`helpers` 零死导出，`flow-spec-routes 310→280` `ws 194→150` 均 ≤300。

^^^
^^^block
type: node
id: t-chunk
kind: task
label: Vite 拆包 1.6MB 治理
status: todo
x: 460
y: 260
---
## §1.3 Vite 拆包 1.6MB 治理

**Why**：`flow-preview build 1655kB` `md-editor-rt` 单 chunk，评审 Minor 延期。

**What**：
- `vite.config.ts build.rollupOptions.output.manualChunks = { 'md-editor': ['md-editor-rt'], 'xyflow': ['@xyflow/react'] }`
- `NodeDetail/EdgeDetail` 改 `dynamic import('md-editor-rt')` 懒加载
- `chunkSizeWarningLimit 600` 绿

^^^
^^^block
type: node
id: t-v4
kind: task
label: v4 graph-assisted 调参
status: todo
x: 640
y: 200
---
## §2.1 v4 graph-assisted 调参

**Why**：v3/v4 通道已通（`preview/server 502 兜底`），但 graphDepth/score 融合未度量。

**What**：
- `trapmap-retrieval/search` `channel v4` 压测 `graphDepth 1/2/3` 对 P99/命中率影响
- 引入 `retrieval/README` dataset 小规模 A/B，阈值 `graphDepth=2 score>=0.72`

**Done**：`evals/retrieval` 通过，`v4` 成为默认 `channel`。

^^^
^^^block
type: node
id: t-eval
kind: task
label: Eval 全量与 badcase 回流
status: todo
x: 640
y: 280
---
## §2.2 Eval 全量与 badcase 回流

- 跑 `pnpm eval:smoke` + `pnpm eval:full` 对齐 `docs/operations/TESTING.md`
- `evals/retrieval badcase` → `knowledge-write` 治理规则（去重/截断/权限）

^^^
^^^block
type: node
id: t-daemon
kind: task
label: flow serve 守护稳定性
status: doing
x: 120
y: 460
---
## §3.1 flow serve 守护稳定性

**Why**：`serve --port 5176 detached + 800ms isAlive` 已可用，但 PID 残留、`flowspec/.flowspec.pid` stale 需人力 `stop`。

**What**：
- `commands/serve.ts` 启动前 `isAlive(pid)` 失败则自动 `unlink stale` 并 `unref` 重启
- `daemon.ts` 加 `SIGTERM→SIGKILL` 优雅退出与 `console.log` 仅 `--debug`
- `e2e: trapmap flow serve --dir flowspec && curl /api/flow-spec?dir=flowspec && trapmap flow stop`

^^^
^^^block
type: node
id: t-multitab
kind: task
label: 多标签持久化与模板库
status: todo
x: 360
y: 460
---
## §3.2 多标签持久化与模板库

**What**：
- `hooks/useFlowList.ts` `activeId` 同步 `?id= + localStorage flow:preview:activeId`，刷新不丢失
- `LeftNav+FlowTabs` 统一 `Card/Chip` 视觉，`collapsed 56px` 保留 `Tooltip`
- `flowspec/` 新增 `roadmap.md / rfc-template.md / adr-template.md` 三件套，`syncFromFilesystem` 自动发现

^^^
^^^block
type: node
id: dec-strategy
kind: decision
label: 决策：复用 vs 重写
status: todo
color: amber
icon: GitBranch
x: 520
y: 480
---
## 决策 — 复用 vs 重写

| 方案 | 成本 | 收益 | 结论 |
|------|------|------|------|
| 薄重构（当前） | 低，10 commits | 单文件约束达成 | 已验证 203/400 |
| 重写 preview | 高，需重搭 WS | 彻底解 coupling | 仅当 SSE 搬迁后仍超 300 再议 |

> **暂定薄重构**，债务清零后再评估。

^^^
^^^block
type: node
id: risk-drift
kind: risk
label: 风险：锁分脑与漂移
status: todo
color: rose
bgColor: "#fff1f2"
icon: AlertTriangle
x: 360
y: 140
---
## 风险 — 锁分脑与文件漂移

- 窗口：`fs.watch 80ms debounce` + `PUT saveSpecRaw` 竞写
- 缓解：`frontmatter locked/holder` 权威 + `tmp+rename` 原子 + `409` 回滚
- 观测：`preview/server ws broadcast` 打点 `lock.conflict` 指标

^^^
^^^block
type: node
id: mile-m1
kind: milestone
label: 里程碑：债务清零 09-15
status: todo
color: emerald
bgColor: "#d1fae5"
icon: Flag
x: 280
y: 280
---
## 里程碑 — 债务清零 09-15

- 时间：**2026-09-15**
- 准出：`store 206/250 flow-spec-routes ≤280 App 203/400` 仍绿，`fallow audit 0`，`74/74`
- 看板：`pnpm check:asserts 0 + typecheck 0 + build 1.x MB`

^^^
^^^block
type: node
id: goal-stable
kind: goal
label: 目标：零容忍门禁
status: idea
color: indigo
icon: Target
x: 520
y: 540
---
## 目标 — 零容忍门禁

北极星：`单文件行数 + 裸断言 + 原子性` 进 CI 门禁，任何 PR 超限即红。

^^^
^^^block
type: node
id: insight-modular
kind: insight
label: 洞察：单文件是大块头
status: idea
color: amber
icon: Lightbulb
x: 120
y: 560
---
## 洞察 — 单文件是大块头

`store 481→206` `App 1211→203` 证明“数组挂载 + 域拆分”比“参数化”更易守约束，热点是 `flow-spec-routes` 与 `store/sync`。

^^^
^^^block
type: node
id: q-wal
kind: question
label: 待验证：1.6MB 是否需懒加载
status: todo
color: violet
icon: HelpCircle
x: 640
y: 460
---
## 待验证 — 1.6MB 是否需懒加载

`md-editor-rt 1.6MB` 对首屏影响需度量 `TTFB + FCP`，若 `dynamic import` 后 `NodeDetail` 首开延迟 >200ms 则改 `manualChunks` 静态拆分。

^^^
^^^block
type: edge
id: e-root-debt
source: root-roadmap
target: b-debt
kind: hierarchical
---
root 拆解为债务分支
^^^
^^^block
type: edge
id: e-root-retrieval
source: root-roadmap
target: b-retrieval
kind: hierarchical
---
root 拆解为检索分支
^^^
^^^block
type: edge
id: e-root-dx
source: root-roadmap
target: b-dx
kind: hierarchical
---
root 拆解为体验分支
^^^
^^^block
type: edge
id: e-root-govern
source: root-roadmap
target: b-govern
kind: hierarchical
---
root 拆解为治理分支
^^^
^^^block
type: edge
id: e-debt-atomic
source: b-debt
target: t-atomic
kind: hierarchical
---
债务收敛拆为原子提升
^^^
^^^block
type: edge
id: e-debt-sse
source: b-debt
target: t-sse
kind: hierarchical
---
债务收敛拆为 SSE 归位
^^^
^^^block
type: edge
id: e-debt-chunk
source: b-debt
target: t-chunk
kind: hierarchical
---
债务收敛拆为拆包治理
^^^
^^^block
type: edge
id: e-retrieval-v4
source: b-retrieval
target: t-v4
kind: hierarchical
---
检索拆为 v4 调参
^^^
^^^block
type: edge
id: e-retrieval-eval
source: b-retrieval
target: t-eval
kind: hierarchical
---
检索拆为 eval 回流
^^^
^^^block
type: edge
id: e-dx-daemon
source: b-dx
target: t-daemon
kind: hierarchical
---
体验拆为守护稳定性
^^^
^^^block
type: edge
id: e-dx-multitab
source: b-dx
target: t-multitab
kind: hierarchical
---
体验拆为多标签
^^^
^^^block
type: edge
id: e-govern-decision
source: b-govern
target: dec-strategy
kind: hierarchical
---
治理包含策略决策
^^^
^^^block
type: edge
id: e-atomic-sse
source: t-atomic
target: t-sse
kind: dependency
label: 依赖
---
原子 helper 就位后才能拆 server
^^^
^^^block
type: edge
id: e-sse-chunk
source: t-sse
target: t-chunk
kind: sequence
label: 顺序
---
SSE 归位后定拆包基线
^^^
^^^block
type: edge
id: e-sse-mile
source: t-sse
target: mile-m1
kind: causal
label: 导致里程碑
---
债务清零由 SSE 归位驱动
^^^
^^^block
type: edge
id: e-daemon-multitab
source: t-daemon
target: t-multitab
kind: dependency
label: 依赖
---
守护稳后持久化多标签
^^^
^^^block
type: edge
id: e-v4-eval
source: t-v4
target: t-eval
kind: sequence
label: 先调参后回流
---
v4 基线确定后才回流 badcase
^^^
^^^block
type: edge
id: e-mile-goal
source: mile-m1
target: goal-stable
kind: async
label: 异步度量
---
里程碑后异步度量门禁
^^^
^^^block
type: edge
id: e-goal-insight
source: goal-stable
target: insight-modular
kind: reference
label: 关联洞察
---
门禁达成依赖模块化洞察
^^^
^^^block
type: edge
id: e-insight-atomic
source: insight-modular
target: t-atomic
kind: feedback
label: 反馈优化
color: "#10b981"
dash: 5 5
---
洞察回流优化原子拆分
^^^
^^^block
type: edge
id: e-risk-block
source: dec-strategy
target: risk-drift
kind: blocked
label: 阻塞
color: "#f43f5e"
width: 2
dash: 6 4
---
策略未定前风险未闭环
^^^
^^^block
type: edge
id: e-risk-sse
source: risk-drift
target: t-sse
kind: causal
label: 缓解
---
漂移风险由 SSE/锁拆分缓解
^^^
^^^block
type: edge
id: e-q-chunk
source: q-wal
target: t-chunk
kind: reference
label: 待验证关联
---
拆包方案待验证
^^^
