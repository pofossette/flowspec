---
locked: false
version: 1.0.0
rootId: root
title: Flow Preview Next Stage — 图即 Spec
updatedAt: 2026-08-29T13:30:00.000Z
---

# Flow Preview Next Stage — 图即 Spec

> 下一阶段任务图：重启后一键拉起、Spec 即图、第三方节点评估、主题沾满固化。对应 superpowers spec `docs/superpowers/specs/2026-08-29-flow-preview-next-stage-design.md`，预览即本文件可视化。

## Meta

- author: flow-spec
- tags: next-stage, spec, preview
- specRef: docs/superpowers/specs/2026-08-29-flow-preview-next-stage-design.md

^^^block
type: node
id: root
kind: root
label: Flow Preview Next Stage
status: doing
---
图即 spec，spec 即图。React+Zustand+HeroUI+Tailwind 预览已交付，下一阶段聚焦重启拉起、spec 可视化与第三方评估。
^^^
^^^block
type: node
id: n1
kind: branch
label: 1. 重启后一键拉起
---
独立预览，不依赖 web-panel，cwd 敏感已修复
^^^
^^^block
type: node
id: n11
kind: goal
label: 绝对路径 dist
color: "#4338ca"
---
目标：import.meta.url 推导 repoRoot，pnpm --filter 双 cwd 均可解析 dist
^^^
^^^block
type: node
id: n12
kind: question
label: cwd 敏感
---
待验证：apps/cli vs apps/flow-preview 下相对路径解析差异
^^^
^^^block
type: node
id: n13
kind: risk
label: 端口占用
---
风险：5176 被占用时需 --port 递增
^^^
^^^block
type: node
id: n2
kind: branch
label: 2. Spec 即图
---
superpowers spec 格式 + 流程图预览联动
^^^
^^^block
type: node
id: n21
kind: milestone
label: spec 格式对齐
---
里程碑：复刻 2026-08-16 统一组装中心 spec 结构，标题+状态+需求+背景+调研+架构+风险+验证
^^^
^^^block
type: node
id: n22
kind: insight
label: 图即 spec 引用
---
认知：每个 spec 对应 flowspec/<slug>.md，specRef 双向引用，flow preview <id> 即可可视化
^^^
^^^block
type: node
id: n3
kind: branch
label: 3. 第三方节点评估
---
React Flow 适配的第三方节点库选型
^^^
^^^block
type: node
id: n31
kind: task
label: 官方 Shapes
---
Pro 单 Shape 组件 data.type 分发，已开源复刻为 FlowNodeShape
^^^
^^^block
type: node
id: n32
kind: task
label: mindmap-app 教程
---
xyflow/react-flow-mindmap-app：input 编辑 + 父子跟随 + Zustand
^^^
^^^block
type: node
id: n33
kind: note
label: 社区边库
---
react-flow-smart-edge / avoid-nodes-edge（libavoid WASM）仅边辅助，节点无需引入
^^^
^^^block
type: node
id: n4
kind: branch
label: 4. 主题固化
---
跟随系统 / 亮色 / 暗色，默认跟随系统
^^^
^^^block
type: node
id: n41
kind: task
label: Zustand theme-store
---
persist mode system，matchMedia 监听，documentElement dark 类
^^^
^^^block
type: node
id: n42
kind: task
label: HeroUI Select
---
Select value=mode onChange 三档，Tailwind panel 变量 + FlowMapCanvas colorMode
^^^
^^^block
type: node
id: n5
kind: branch
label: 5. 画布沾满与暗色
---
沾满侧栏以外，暗色下节点/边正确
^^^
^^^block
type: node
id: n51
kind: task
label: flex 沾满
---
App 容器 flex-1 flex-col min-h-0，FlowMapCanvas flex-1 min-h-0 h-full，puppeteer 测 canvasH 427 沾满
^^^
^^^block
type: node
id: n52
kind: task
label: 暗色适配
---
KIND_DEFAULTS_DARK + isDarkMode()，CustomEdges darkFallback，Background #27272a
^^^
^^^block
type: node
id: n53
kind: note
label: 不溢出
---
SVG polygon + safe padding 已修复三角/菱形/六边形文字溢出
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
id: e2
source: root
target: n2
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
id: e3
source: root
target: n3
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
kind: reference
label: 可选
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
id: e42
source: n4
target: n42
kind: sequence
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
label: 已修复
---
^^^
^^^block
type: edge
id: ex2
source: n33
target: n51
kind: reference
label: 评估
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
实现方案：cwd 敏感经 3s 轮询暴露，需绝对路径修复；风险为端口占用需递增
^^^
^^^block
type: edge
id: e41
source: n4
target: n41
kind: sequence
label: then
---
实现方案：Zustand persist + effectiveTheme 计算，App 头部 Select 三档默认 system
^^^
^^^block
type: edge
id: ex1
source: n11
target: n2
kind: feedback
label: 支撑
---
实现方案：绝对路径 dist 支撑 Spec 即图的可视化预览
^^^
^^^block
type: edge
id: ex3
source: n42
target: n51
kind: dependency
label: 联动
---
实现方案：主题 Select 联动画布沾满与暗色适配，puppeteer 验证切换
^^^
