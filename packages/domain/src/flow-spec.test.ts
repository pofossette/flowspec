import { describe, expect, it } from 'vitest';
import { flowSpecExample, flowSpecSchema, validateFlowSpec } from './flow-spec.js';

const allNodeKinds = [
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
] as const;
const allEdgeKinds = [
  'hierarchical',
  'dependency',
  'reference',
  'causal',
  'sequence',
  'async',
  'feedback',
  'blocked',
] as const;

describe('flow-spec', () => {
  it('example validates', () => {
    expect(() => validateFlowSpec(flowSpecExample)).not.toThrow();
  });

  it('rejects bad rootId', () => {
    const bad = { ...flowSpecExample, rootId: 'missing' };
    const res = flowSpecSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it('validates all 11 node kinds', () => {
    for (const kind of allNodeKinds) {
      const spec = {
        ...flowSpecExample,
        nodes: [{ id: 'x', kind, label: `label-${kind}` }],
        rootId: 'x',
        edges: [],
      };
      const res = flowSpecSchema.safeParse(spec);
      expect(res.success, `kind ${kind} should validate`).toBe(true);
    }
    // also validate style is optional and accepted
    const withStyle = {
      ...flowSpecExample,
      nodes: [
        {
          id: 'x',
          kind: 'goal' as const,
          label: 'Goal',
          style: { color: 'indigo', bgColor: '#e0e7ff', icon: 'Target' },
        },
      ],
      rootId: 'x',
      edges: [],
    };
    expect(flowSpecSchema.safeParse(withStyle).success).toBe(true);
  });

  it('validates all 8 edge kinds', () => {
    for (const kind of allEdgeKinds) {
      const spec = {
        ...flowSpecExample,
        nodes: [
          { id: 'a', kind: 'root' as const, label: 'a' },
          { id: 'b', kind: 'branch' as const, label: 'b' },
        ],
        rootId: 'a',
        edges: [{ id: 'e1', source: 'a', target: 'b', kind, directed: true }],
      };
      const res = flowSpecSchema.safeParse(spec);
      expect(res.success, `edge kind ${kind} should validate`).toBe(true);
    }
    // style optional
    const withStyle = {
      ...flowSpecExample,
      nodes: [
        { id: 'a', kind: 'root' as const, label: 'a' },
        { id: 'b', kind: 'branch' as const, label: 'b' },
      ],
      rootId: 'a',
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          kind: 'sequence' as const,
          directed: true,
          style: { color: '#6366f1', width: 2, dash: '5 5' },
        },
      ],
    };
    expect(flowSpecSchema.safeParse(withStyle).success).toBe(true);
  });
});
