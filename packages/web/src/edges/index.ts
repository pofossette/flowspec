export {
  CommunityAsyncEdge,
  CommunityBlockedEdge,
  CommunityCausalEdge,
  CommunityDependencyEdge,
  CommunityFeedbackEdge,
  CommunityHierarchicalEdge,
  CommunityReferenceEdge,
  CommunitySequenceEdge,
} from './CommunityEdges.js';
export {
  AsyncEdge,
  BlockedEdge,
  CausalEdge,
  DependencyEdge,
  FeedbackEdge,
  HierarchicalEdge,
  ReferenceEdge,
  SequenceEdge,
} from './CustomEdges.js';

import {
  CommunityAsyncEdge,
  CommunityBlockedEdge,
  CommunityCausalEdge,
  CommunityDependencyEdge,
  CommunityFeedbackEdge,
  CommunityHierarchicalEdge,
  CommunityReferenceEdge,
  CommunitySequenceEdge,
} from './CommunityEdges.js';

// 社区包替代手搓：用 @tisoap/react-flow-smart-edge 负责避障，原 CustomEdges 保留作 Legacy
export const flowEdgeTypes = {
  hierarchical: CommunityHierarchicalEdge,
  sequence: CommunitySequenceEdge,
  dependency: CommunityDependencyEdge,
  async: CommunityAsyncEdge,
  reference: CommunityReferenceEdge,
  causal: CommunityCausalEdge,
  feedback: CommunityFeedbackEdge,
  blocked: CommunityBlockedEdge,
  // aliases for adapter's legacy generic types
  smoothstep: CommunityHierarchicalEdge,
  bezier: CommunitySequenceEdge,
  straight: CommunityReferenceEdge,
  step: CommunityCausalEdge,
} as const;

// also export fine-grained names for consumers preferring hierarchicalEdge-style keys
export const flowEdgeTypesByKind = flowEdgeTypes;
