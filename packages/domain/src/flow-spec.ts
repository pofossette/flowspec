import { z } from 'zod';

/**
 * FlowSpec — AI-native mind-map spec, counterpart to superpowers spec.
 * Stored as JSON `flow-spec.json` under `.flow-spec/` or standalone file.
 * Web canvas renders it via React Flow; CLI + AI streaming both produce it.
 */

export const flowNodeKindSchema = z.enum([
  'root',
  'branch',
  'leaf',
  'task',
  'decision',
  'note',
  'goal',
  'milestone',
  'risk',
  'insight',
  'question',
]);
export type FlowNodeKind = z.infer<typeof flowNodeKindSchema>;

export const flowNodeStatusSchema = z.enum(['todo', 'doing', 'done', 'blocked', 'idea']);
export type FlowNodeStatus = z.infer<typeof flowNodeStatusSchema>;

export const flowNodeStyleSchema = z.object({
  color: z.string().optional(),
  bgColor: z.string().optional(),
  icon: z.string().optional(),
});
export type FlowNodeStyle = z.infer<typeof flowNodeStyleSchema>;

export const flowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: flowNodeKindSchema.default('branch'),
  label: z.string().min(1).max(200),
  content: z.string().max(4000).optional(),
  status: flowNodeStatusSchema.optional(),
  collapsed: z.boolean().optional(),
  // optional manual position; when omitted, auto-layout applies
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  style: flowNodeStyleSchema.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowEdgeKindSchema = z.enum([
  'hierarchical',
  'dependency',
  'reference',
  'causal',
  'sequence',
  'async',
  'feedback',
  'blocked',
]);
export type FlowEdgeKind = z.infer<typeof flowEdgeKindSchema>;

export const flowEdgeStyleSchema = z.object({
  color: z.string().optional(),
  width: z.number().optional(),
  dash: z.string().optional(),
});
export type FlowEdgeStyle = z.infer<typeof flowEdgeStyleSchema>;

export const flowEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: flowEdgeKindSchema.default('hierarchical'),
  label: z.string().max(120).optional(),
  /** 详细实现方案描述，节点 content 为目标状态，边 content 为实现路径 */
  content: z.string().max(5000).optional(),
  directed: z.boolean().default(true),
  style: flowEdgeStyleSchema.optional(),
});
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowSpecMetaSchema = z.object({
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  specRef: z.string().optional(), // e.g. superpowers spec path this map was derived from
});
export type FlowSpecMeta = z.infer<typeof flowSpecMetaSchema>;

export const flowSpecSchema = z
  .object({
    version: z.string().default('1.0.0'),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    rootId: z.string().min(1),
    nodes: z.array(flowNodeSchema).min(1).max(2000),
    edges: z.array(flowEdgeSchema).max(5000).default([]),
    meta: flowSpecMetaSchema.optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const ids = new Set(val.nodes.map((n) => n.id));
    if (!ids.has(val.rootId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rootId'],
        message: `rootId "${val.rootId}" not found in nodes`,
      });
    }
    for (const e of val.edges) {
      if (!ids.has(e.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `edge ${e.id} source "${e.source}" not found`,
        });
      }
      if (!ids.has(e.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `edge ${e.id} target "${e.target}" not found`,
        });
      }
    }
  });

export type FlowSpec = z.infer<typeof flowSpecSchema>;

// --- helpers aligned with existing TrapMap GraphPlan conventions ---

export function createFlowId(prefix: 'node' | 'edge' = 'node'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function validateFlowSpec(input: unknown): FlowSpec {
  return flowSpecSchema.parse(input);
}

export function safeParseFlowSpec(input: unknown): ReturnType<typeof flowSpecSchema.safeParse> {
  return flowSpecSchema.safeParse(input);
}

// Minimal fixture for tests / AI prompt example
export const flowSpecExample: FlowSpec = {
  version: '1.0.0',
  title: 'FlowSpec Example — User Auth Feature',
  description: 'AI-generated mind-map spec, editable on web canvas.',
  rootId: 'root-1',
  nodes: [
    { id: 'root-1', kind: 'root', label: 'User Auth Feature', status: 'todo' },
    { id: 'n1', kind: 'branch', label: 'Requirements', content: 'OAuth2 + RBAC + audit log' },
    { id: 'n2', kind: 'task', label: 'API design', content: 'POST /auth/login, session mgmt' },
    { id: 'n3', kind: 'task', label: 'UI — Login page', content: 'React form + validation' },
    { id: 'n4', kind: 'decision', label: 'Storage choice', content: 'PG vs redis session?' },
    {
      id: 'n-goal',
      kind: 'goal',
      label: 'Strategic Goal: Increase adoption',
      content: 'North star metric: DAU +20%',
      style: { color: 'indigo', bgColor: '#e0e7ff', icon: 'Target' },
    },
    {
      id: 'n-milestone',
      kind: 'milestone',
      label: 'Milestone: Beta launch',
      content: 'Target 2026-09-30',
      style: { color: 'emerald', bgColor: '#d1fae5', icon: 'Flag' },
    },
    {
      id: 'n-risk',
      kind: 'risk',
      label: 'Risk: Vendor lock-in',
      content: 'Mitigate via abstraction layer',
      style: { color: 'rose', bgColor: '#ffe4e6', icon: 'AlertTriangle' },
    },
    {
      id: 'n-insight',
      kind: 'insight',
      label: 'Insight: Users prefer CLI',
      content: 'Interview 12/20 users endorsed CLI first',
      style: { color: 'amber', icon: 'Lightbulb' },
    },
    {
      id: 'n-question',
      kind: 'question',
      label: 'Question: Scale cost?',
      content: 'Pending load test on PG vs queue',
      style: { color: 'violet', icon: 'HelpCircle' },
    },
  ],
  edges: [
    { id: 'e1', source: 'root-1', target: 'n1', kind: 'hierarchical', directed: true },
    { id: 'e2', source: 'root-1', target: 'n2', kind: 'hierarchical', directed: true },
    { id: 'e3', source: 'root-1', target: 'n3', kind: 'hierarchical', directed: true },
    { id: 'e4', source: 'n1', target: 'n4', kind: 'dependency', directed: true, label: 'blocks' },
    {
      id: 'e5',
      source: 'n1',
      target: 'n-goal',
      kind: 'sequence',
      directed: true,
      style: { color: '#6366f1', width: 2 },
    },
    {
      id: 'e6',
      source: 'n2',
      target: 'n-milestone',
      kind: 'async',
      directed: true,
      label: 'async deploy',
    },
    {
      id: 'e7',
      source: 'n-milestone',
      target: 'n1',
      kind: 'feedback',
      directed: true,
      style: { dash: '5 5', color: '#10b981' },
    },
    {
      id: 'e8',
      source: 'n-risk',
      target: 'n4',
      kind: 'blocked',
      directed: true,
      label: 'blocked by',
    },
  ],
};
