// legacy alias for consumers importing from web entry
export type { RFEdge, RFGraph, RFNode } from './adapter.js';
export * from './adapter.js';
export { EDGE_ANIMATION_CSS } from './edges/CustomEdges.js';
export * from './edges/index.js';
export { FLOW_GLOBAL_CSS, FlowGlobalStyles } from './FlowGlobalStyles.js';
export { FlowMapCanvas } from './FlowMapCanvas.js';
export * from './LockBanner.js';
export type { FlowNodeShapeData, FlowNodeShapeProps } from './nodes/FlowNodeShape.js';
export { KIND_DEFAULTS, STATUS_DOT } from './nodes/FlowNodeShape.js';
export * from './nodes/index.js';
export * from './types.js';
export * from './useFlowLock.js';
export * from './components/VCursor.js';
