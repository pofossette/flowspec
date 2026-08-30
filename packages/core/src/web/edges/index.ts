export {
  HierarchicalEdge,
  SequenceEdge,
  DependencyEdge,
  AsyncEdge,
  ReferenceEdge,
  CausalEdge,
  FeedbackEdge,
  BlockedEdge,
} from './CustomEdges.js';
export {
  CommunityHierarchicalEdge,
  CommunitySequenceEdge,
  CommunityDependencyEdge,
  CommunityAsyncEdge,
  CommunityReferenceEdge,
  CommunityCausalEdge,
  CommunityFeedbackEdge,
  CommunityBlockedEdge,
} from './CommunityEdges.js';

import {
  CommunityHierarchicalEdge,
  CommunitySequenceEdge,
  CommunityDependencyEdge,
  CommunityAsyncEdge,
  CommunityReferenceEdge,
  CommunityCausalEdge,
  CommunityFeedbackEdge,
  CommunityBlockedEdge,
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
