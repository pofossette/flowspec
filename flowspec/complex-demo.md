---
locked: false
version: 1.0.0
rootId: root
title: Complex Agent Workflow — Order-to-Cash
updatedAt: 2026-08-29T03:33:07.718Z
---

# Complex Agent Workflow — Order-to-Cash

> 端到端订单履约心智图：从需求捕获、风控、履约到复盘。含分支、依赖、决策与跨链引用，演示 Markdown+XML 人读性与图渲染承载力。

## Meta

- author: flow-spec
- tags: complex, demo, o2c
- specRef: docs/flow-spec/ARCHITECTURE.md

^^^block
type: node
id: root
kind: root
label: Order-to-Cash 全流程
status: todo
---
SLA 99.9% · 3 租户 · 审核闭环
^^^
^^^block
type: node
id: n1
kind: goal
label: 1. 需求与捕获
color: "#4338ca"
---
工单/邮件/口述三渠道归一，意图解析 + 去重
^^^
^^^block
type: node
id: n11
kind: task
label: 意图解析 LLM
---
few-shot + 结构化抽取 → FlowSpec JSON
^^^
^^^block
type: node
id: n12
kind: task
label: 去重与归一
---
pgvector 相似度 0.82 阈值，冲突检测
^^^
^^^block
type: node
id: n13
kind: question
label: 是否自动建单？
---
置信度 ≥0.85 自动，否则人工确认
^^^
^^^block
type: node
id: n2
kind: branch
label: 2. 风控与合规
---
黑名单、额度、合规规则编排
^^^
^^^block
type: node
id: n21
kind: task
label: 风控图谱查询
---
G6 图谱 + 规则引擎
^^^
^^^block
type: node
id: n22
kind: task
label: 合规校验
---
GDPR / SOX 检查清单
^^^
^^^block
type: node
id: n23
kind: milestone
label: 阻断或放行
---
风险分 high/medium/low
^^^
^^^block
type: node
id: n3
kind: branch
label: 3. 履约编排
---
库存、物流、开票并行
^^^
^^^block
type: node
id: n31
kind: task
label: 库存锁定
---
FOR UPDATE 锁 + 幂等
^^^
^^^block
type: node
id: n32
kind: task
label: 物流调度
---
X6 调度面板 · 3PL 对接
^^^
^^^block
type: node
id: n33
kind: task
label: 开票与收款
---
税务接口 · 对账
^^^
^^^block
type: node
id: n4
kind: branch
label: 4. 交付与验收
---
签收、异常、重派
^^^
^^^block
type: node
id: n41
kind: task
label: 签收确认
---
移动端扫码 + 人脸
^^^
^^^block
type: node
id: n42
kind: risk
label: 异常分支
bgColor: "#fff1f2"
---
破损/超时/拒收
^^^
^^^block
type: node
id: n421
kind: task
label: 逆向物流
---
退货单 + 退款
^^^
^^^block
type: node
id: n5
kind: branch
label: 5. 复盘与沉淀
---
Experience Gene 抽取
^^^
^^^block
type: node
id: n51
kind: task
label: Gene 抽取
---
LLM 抽取陷阱/技能对
^^^
^^^block
type: node
id: n52
kind: insight
label: 知识沉淀
---
入 Trap/Skill 库，待治理审核
^^^
^^^block
type: node
id: n53
kind: note
label: 指标看板
---
转化率、SLA、客诉率
^^^
^^^block
type: edge
id: e1
source: root
target: n1
kind: hierarchical
---
^^^
^^^block
type: edge
id: e2
source: root
target: n2
kind: hierarchical
---
^^^
^^^block
type: edge
id: e3
source: root
target: n3
kind: hierarchical
---
^^^
^^^block
type: edge
id: e4
source: root
target: n4
kind: hierarchical
---
^^^
^^^block
type: edge
id: e5
source: root
target: n5
kind: hierarchical
---
^^^
^^^block
type: edge
id: e11
source: n1
target: n11
kind: hierarchical
---
^^^
^^^block
type: edge
id: e12
source: n1
target: n12
kind: hierarchical
---
^^^
^^^block
type: edge
id: e21
source: n2
target: n21
kind: hierarchical
---
^^^
^^^block
type: edge
id: e22
source: n2
target: n22
kind: hierarchical
---
^^^
^^^block
type: edge
id: e31
source: n3
target: n31
kind: hierarchical
---
^^^
^^^block
type: edge
id: e32
source: n3
target: n32
kind: hierarchical
---
^^^
^^^block
type: edge
id: e33
source: n3
target: n33
kind: hierarchical
---
^^^
^^^block
type: edge
id: e41
source: n4
target: n41
kind: hierarchical
---
^^^
^^^block
type: edge
id: e42
source: n4
target: n42
kind: hierarchical
---
^^^
^^^block
type: edge
id: e421
source: n42
target: n421
kind: hierarchical
---
^^^
^^^block
type: edge
id: e51
source: n5
target: n51
kind: hierarchical
---
^^^
^^^block
type: edge
id: e52
source: n5
target: n52
kind: hierarchical
---
^^^
^^^block
type: edge
id: e53
source: n5
target: n53
kind: reference
label: metrics
---
^^^
^^^block
type: edge
id: ex3
source: n32
target: n41
kind: dependency
label: deliver
---
^^^
^^^block
type: edge
id: e13
source: n12
target: n13
kind: dependency
label: blocks
---
实现方案：去重后调用 n13 决策节点，阈值 0.85。步骤：(1) pgvector 相似度检索 TOP3，(2) LLM 二次判定去重，(3) 冲突写入 review_queue。依赖：pgvector 索引、LLM few-shot prompt。风险：相似度误判 → 人工复核兜底。
^^^
^^^block
type: edge
id: e23
source: n21
target: n23
kind: blocked
---
实现方案：风控图谱查询后驱动 n23 阻断决策。接口：G6 图谱 API + 规则引擎（Drools）。时序：同步查询 300ms 超时 → 降级本地黑名单。输出：riskLevel high/medium/low。
^^^
^^^block
type: edge
id: e34
source: n31
target: n32
kind: async
label: then
color: "#6366f1"
width: 2
---
实现方案：库存锁定成功后触发物流调度。流程：(1) SELECT ... FOR UPDATE + 幂等 key，(2) 锁定成功发 MQ 到 3PL，(3) 失败回滚并重试 3 次。幂等：X-Request-Id。
^^^
^^^block
type: edge
id: ex1
source: n13
target: n2
kind: feedback
label: if auto
color: "#10b981"
dash: 5 5
---
实现方案：若 n13 判定自动建单，则跳过人工确认直连 n2 风控。条件：intent.confidence ≥0.85 且去重无冲突。走 causal 边，动画高亮。
^^^
^^^block
type: edge
id: ex2
source: n23
target: n3
kind: sequence
label: gate
---
实现方案：风控放行才可进入履约。门控：n23=riskLevel low 时放行，medium 需二次审批，high 直接阻断并写入治理队列。接口：gate/check。
^^^
^^^block
type: edge
id: ex4
source: n421
target: n51
kind: reference
label: learn
---
实现方案：逆向物流完成后触发 Gene 抽取。流程：n421 产出退款/退货记录 → n51 LLM 抽取陷阱/技能对 → 写入 trap/skill 库待审核。沉淀为 Experience Gene。
^^^
