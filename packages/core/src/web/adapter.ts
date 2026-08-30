import type {
  FlowEdge,
  FlowEdgeKind,
  FlowNode,
  FlowNodeKind,
  FlowSpec,
} from '../domain/flow-spec.js';

// Minimal React Flow compatible types without hard dependency on @xyflow/react
// Consumer may import actual types from @xyflow/react; this adapter stays dependency-soft.

export type RFNode = {
  id: string;
  type?: string | undefined;
  position: { x: number; y: number };
  data: {
    label: string;
    content?: string | undefined;
    kind: string;
    status?: string | undefined;
    icon?: string | undefined;
    color?: string | undefined;
    bgColor?: string | undefined;
    specNode: FlowNode;
  };
};

export type RFEdge = {
  id: string;
  source: string;
  target: string;
  label?: string | undefined;
  type?: string | undefined;
  animated?: boolean | undefined;
  data?:
    | {
        kind: string;
        content?: string | undefined;
        color?: string | undefined;
        width?: number | undefined;
        dash?: string | undefined;
        specEdge: FlowEdge;
      }
    | undefined;
};

export type RFGraph = { nodes: RFNode[]; edges: RFEdge[] };

const NODE_TYPE_BY_KIND: Record<FlowNodeKind, string> = {
  root: 'flowRoot',
  branch: 'flowBranch',
  leaf: 'flowLeaf',
  task: 'flowTask',
  decision: 'flowDecision',
  note: 'flowNote',
  goal: 'flowGoal',
  milestone: 'flowMilestone',
  risk: 'flowRisk',
  insight: 'flowInsight',
  question: 'flowQuestion',
};

const EDGE_TYPE_BY_KIND: Record<FlowEdgeKind, string> = {
  hierarchical: 'hierarchical',
  sequence: 'sequence',
  dependency: 'dependency',
  async: 'async',
  reference: 'reference',
  causal: 'causal',
  feedback: 'feedback',
  blocked: 'blocked',
};

/**
 * Deterministic radial/tree fallback layout when node.position is absent.
 * Brewed to be cheap — consumers can replace with dagre/elk for large maps.
 */
function autoPosition(index: number, total: number, depth: number): { x: number; y: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 1.6 - Math.PI * 0.8;
  const radius = 220 + depth * 180;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.7 };
}

function depthOf(
  nodeId: string,
  spec: FlowSpec,
  memo = new Map<string, number>(),
  visiting = new Set<string>(),
): number {
  if (nodeId === spec.rootId) return 0;
  if (memo.has(nodeId)) return memo.get(nodeId)!;
  if (visiting.has(nodeId)) return 0;
  visiting.add(nodeId);
  // 仅 hierarchical 决定层级深度，避免 feedback/reference 等成环边导致无限递归
  const incoming = spec.edges.filter((e) => e.target === nodeId && e.kind === 'hierarchical');
  if (incoming.length === 0) {
    visiting.delete(nodeId);
    memo.set(nodeId, 1);
    return 1;
  }
  const d = 1 + Math.max(...incoming.map((e) => depthOf(e.source, spec, memo, visiting)));
  visiting.delete(nodeId);
  memo.set(nodeId, d);
  return d;
}

export function flowSpecToRF(spec: FlowSpec): RFGraph {
  const memo = new Map<string, number>();
  const nodes: RFNode[] = spec.nodes.map((n, i) => {
    const depth = depthOf(n.id, spec, memo);
    return {
      id: n.id,
      type: NODE_TYPE_BY_KIND[n.kind] ?? 'flowBranch',
      position: n.position ?? autoPosition(i, spec.nodes.length, depth),
      data: {
        label: n.label,
        content: n.content,
        kind: n.kind,
        status: n.status,
        icon: n.style?.icon,
        color: n.style?.color,
        bgColor: n.style?.bgColor,
        specNode: n,
      },
    };
  });
  const edges: RFEdge[] = spec.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: EDGE_TYPE_BY_KIND[e.kind] ?? 'hierarchical',
    animated: e.kind === 'dependency' || e.kind === 'async',
    data: {
      kind: e.kind,
      content: e.content,
      color: e.style?.color,
      width: e.style?.width,
      dash: e.style?.dash,
      specEdge: e,
    },
  }));
  return { nodes, edges };
}

export function rfToFlowSpec(graph: RFGraph, base: FlowSpec): FlowSpec {
  const nodeMap = new Map(base.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(base.edges.map((e) => [e.id, e]));
  const nextNodes: FlowSpec['nodes'] = graph.nodes.map((rn) => {
    const prev = nodeMap.get(rn.id);
    // Style merge semantics: missing key retains prev.style value, present key with `undefined` deletes that style prop.
    // This preserves other style keys on partial updates (e.g., changing only color keeps bgColor/icon).
    const prevStyle = prev?.style;
    const color = 'color' in rn.data ? rn.data.color : prevStyle?.color;
    const bgColor = 'bgColor' in rn.data ? rn.data.bgColor : prevStyle?.bgColor;
    const icon = 'icon' in rn.data ? rn.data.icon : prevStyle?.icon;
    const style =
      color !== undefined || bgColor !== undefined || icon !== undefined
        ? {
            ...(color !== undefined ? { color } : {}),
            ...(bgColor !== undefined ? { bgColor } : {}),
            ...(icon !== undefined ? { icon } : {}),
          }
        : undefined;
    return {
      id: rn.id,
      kind: (rn.data.kind as FlowNode['kind']) ?? prev?.kind ?? 'branch',
      label: rn.data.label,
      content: rn.data.content ?? prev?.content,
      status: (rn.data.status as FlowNode['status']) ?? prev?.status,
      position: rn.position,
      ...(style ? { style } : {}),
      data: prev?.data,
    };
  });
  const nextEdges: FlowSpec['edges'] = graph.edges.map((re) => {
    const prev = edgeMap.get(re.id);
    // Same semantics for edges: missing key retains, undefined deletes — preserves width/dash on partial color updates.
    const prevStyle = prev?.style;
    const color = re.data != null && 'color' in re.data ? re.data.color : prevStyle?.color;
    const width = re.data != null && 'width' in re.data ? re.data.width : prevStyle?.width;
    const dash = re.data != null && 'dash' in re.data ? re.data.dash : prevStyle?.dash;
    const style =
      color !== undefined || width !== undefined || dash !== undefined
        ? {
            ...(color !== undefined ? { color } : {}),
            ...(width !== undefined ? { width } : {}),
            ...(dash !== undefined ? { dash } : {}),
          }
        : undefined;
    return {
      id: re.id,
      source: re.source,
      target: re.target,
      kind: (re.data?.kind as FlowEdge['kind']) ?? prev?.kind ?? 'hierarchical',
      label: re.label ?? prev?.label,
      content: re.data?.content ?? prev?.content,
      directed: true,
      ...(style ? { style } : {}),
    };
  });
  return {
    ...base,
    nodes: nextNodes,
    edges: nextEdges,
    updatedAt: new Date().toISOString(),
  };
}
