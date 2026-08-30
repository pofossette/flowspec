---
locked: true
version: 1.0.0
rootId: root-1
title: Showcase — 智能检索增量编译
createdAt: 2026-08-30T10:00:00.000Z
updatedAt: 2026-08-30T11:00:00.000Z
holder: web:local
note: web editing
acquiredAt: 2026-08-30T11:28:08.648Z
---

# Showcase — 智能检索增量编译

> 从 markdown spec 衍生的外挂图谱 —— 文档为本体，图谱为导航

^^^block
type: node
id: root-1
kind: root
label: 智能检索增量编译
status: doing
x: 0
y: 0
color: indigo
bgColor: "#eef2ff"
icon: Rocket
---
# 文档本体（点击节点即阅读原文）

> **本质：给 md 文档加上块标识（短标题 + 元信息），原文以节点点击展示 —— 文档 + 优化，而非纯流程图**

## 背景 — 为什么增量

这是一份**正常 markdown**，但已被 `^^^block` 包裹为节点。文件本身仍是可读 md，多标签工作区直接以此为真相源。

- 检索链路冷启动 2.1s → 目标 200ms 内
- 10w+ 知识条目需文件级失效，约束来自 `.flowspec/mark.json` + `preview.json`

## 关键约束

> [!NOTE]
> `^^^block` 必须单独一行 `type: node|edge`；`---` 分隔 YAML 与正文；正文即节点点击后看到的文档原文。

点击任意子节点（分支/任务/决策…）查看对应章节正文；边表示“如何到达”的实现路径，而非独立图。
^^^
^^^block
type: node
id: n-require
kind: branch
label: 需求分解
status: done
color: "#4338ca"
---
## §1 需求分解 — 文档章节正文

> 短标题 `需求分解` 是块标识，下列即原文，图谱点击即阅读。

- **全量建图仅首次**：启动时一次性 `SnapshotStore` 快照
- **文件级失效**：变更文件 → `PatchLog` 片段失效
- **查询走快照 + WAL**：`QueryView = Snapshot ∪ WAL`，内存常驻

^^^
^^^block
type: node
id: n-arch
kind: task
label: 架构设计 — 分层快照
status: doing
---
## §2 架构设计 — 分层快照

三层：`SnapshotStore`（日级 Parquet）+ `PatchLog`（分片 WAL）+ `QueryView`（内存合并视图）。

```ts
// 伪代码：增量合并
function queryView(snapshot, wal) {
  return merge(snapshot, wal.filter(p => !p.compacted));
}
```

- 快照每日 02:00 触发，`BloomFilter` 加速跳片
- WAL 按 `shardId` 追加，阈值 10k 条触发微合并

^^^
^^^block
type: node
id: n-decision
kind: decision
label: 决策：快照格式
status: todo
color: amber
icon: GitBranch
---
## 决策 — 快照格式

| 方案 | 读 P99 | 写成本 | 结论 |
|------|--------|--------|------|
| Parquet 列存 | 42ms | 高（需编码） | 读快 4x |
| JSONL 行存 | 180ms | 低 | 调试友好 |

> **暂定 Parquet + BloomFilter**，后续 A/B 度量实际命中率波动。

^^^
^^^block
type: node
id: n-risk
kind: risk
label: 风险：一致性漂移
status: todo
color: rose
bgColor: "#fff1f2"
icon: AlertTriangle
---
## 风险 — 一致性漂移

- 窗口：快照合并期间新 WAL 写入可能丢失
- 缓解：两阶段提交 + `checksum` 端到端校验
- 回滚：合并失败保留旧快照，WAL 重放

^^^
^^^block
type: node
id: n-milestone
kind: milestone
label: 里程碑：灰度 10% 流量
status: todo
color: emerald
bgColor: "#d1fae5"
icon: Flag
---
## 里程碑 — 灰度 10%

- 时间：**2026-09-20**
- 指标：`P99 < 300ms` 且 `命中率 ≥ 0.92 ±0.01`
- 准出：Dashboard 看板 + 告警 `load.incremental.lag > 5s`

^^^
^^^block
type: node
id: n-goal
kind: goal
label: 目标：命中率 > 0.92
status: idea
color: indigo
icon: Target
---
北极星：检索命中率 0.92，增量编译后保持 ±0.01 波动。
^^^
^^^block
type: node
id: n-insight
kind: insight
label: 洞察：热点分片集中
status: idea
color: amber
icon: Lightbulb
---
Top 5% 分片承载 70% 查询，走热点缓存可省 40% 计算。
^^^
^^^block
type: node
id: n-question
kind: question
label: 待验证：WAL 膨胀成本
status: todo
color: violet
icon: HelpCircle
---
1w 次变更后 WAL 1.2GB，需测压缩比与合并阈值。
^^^
^^^block
type: edge
id: e1
source: root-1
target: n-require
kind: hierarchical
---
root 拆解为需求分支
^^^
^^^block
type: edge
id: e2
source: n-require
target: n-arch
kind: dependency
label: 依赖
---
需求确定后才能定架构
^^^
^^^block
type: edge
id: e3
source: n-arch
target: n-decision
kind: causal
label: 导致决策
---
架构选型触发格式决策
^^^
^^^block
type: edge
id: e4
source: n-decision
target: n-risk
kind: blocked
label: 阻塞
color: "#f43f5e"
width: 2
dash: 6 4
---
快照格式未定前风险无法闭环
^^^
^^^block
type: edge
id: e5
source: n-arch
target: n-milestone
kind: sequence
label: 分阶段交付
color: "#6366f1"
width: 2
---
架构落地按里程碑排期
^^^
^^^block
type: edge
id: e6
source: n-milestone
target: n-goal
kind: async
label: 异步度量
---
灰度期间异步统计命中率
^^^
^^^block
type: edge
id: e7
source: n-goal
target: n-insight
kind: reference
label: 关联洞察
---
目标达成依赖热点洞察
^^^
^^^block
type: edge
id: e8
source: n-insight
target: n-arch
kind: feedback
label: 反馈优化
color: "#10b981"
dash: 5 5
---
热点洞察回流优化分片策略
^^^
