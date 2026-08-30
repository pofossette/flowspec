export { CommunityMindMapNode } from './CommunityMindMapNode.js';
export type { FlowNodeShapeData, FlowNodeShapeProps } from './FlowNodeShape.js';
export { FlowNodeShape, KIND_DEFAULTS, KIND_DEFAULTS_DARK, STATUS_DOT } from './FlowNodeShape.js';

import { CommunityMindMapNode } from './CommunityMindMapNode.js';

// 社区包替代手搓：统一用 CommunityMindMapNode（基于 xyflow/mindmap-app MIT），彻底避免 clipPath 溢出与边框错位
export const flowNodeTypes = {
  flowRoot: CommunityMindMapNode,
  flowBranch: CommunityMindMapNode,
  flowLeaf: CommunityMindMapNode,
  flowTask: CommunityMindMapNode,
  flowDecision: CommunityMindMapNode,
  flowNote: CommunityMindMapNode,
  flowGoal: CommunityMindMapNode,
  flowMilestone: CommunityMindMapNode,
  flowRisk: CommunityMindMapNode,
  flowInsight: CommunityMindMapNode,
  flowQuestion: CommunityMindMapNode,
} as const;

// 保留手搓版本以便回滚对比（不推荐）
export { FlowNodeShape as LegacyFlowNodeShape } from './FlowNodeShape.js';
