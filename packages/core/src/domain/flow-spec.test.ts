import { describe, expect, it } from 'vitest';
import { flowSpecExample, flowSpecSchema, validateFlowSpec } from './flow-spec.js';
import { flowSpecToRF, rfToFlowSpec } from '../web/adapter.js';

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

  it('adapter round-trip', () => {
    const rf = flowSpecToRF(flowSpecExample);
    expect(rf.nodes.length).toBe(flowSpecExample.nodes.length);
    expect(rf.edges.length).toBe(flowSpecExample.edges.length);
    const back = rfToFlowSpec(rf, flowSpecExample);
    expect(back.nodes.length).toBe(rf.nodes.length);
  });

  it('adapter preserves style round-trip', () => {
    const spec = {
      ...flowSpecExample,
      nodes: [
        {
          id: 'a',
          kind: 'goal' as const,
          label: 'Goal',
          style: { color: '#ff0000', bgColor: '#00ff00', icon: 'Target' },
        },
        { id: 'b', kind: 'branch' as const, label: 'Branch' },
      ],
      rootId: 'a',
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          kind: 'sequence' as const,
          directed: true as const,
          style: { color: '#6366f1', width: 2, dash: '5 5' },
        },
      ],
    };
    const rf = flowSpecToRF(spec);
    expect(rf.nodes[0]!.data.color).toBe('#ff0000');
    expect(rf.nodes[0]!.data.bgColor).toBe('#00ff00');
    expect(rf.nodes[0]!.data.icon).toBe('Target');
    expect(rf.edges[0]!.data?.color).toBe('#6366f1');
    expect(rf.edges[0]!.data?.width).toBe(2);
    expect(rf.edges[0]!.data?.dash).toBe('5 5');
    const back = rfToFlowSpec(rf, spec);
    expect(back.nodes[0]!.style).toEqual({ color: '#ff0000', bgColor: '#00ff00', icon: 'Target' });
    expect(back.edges[0]!.style).toEqual({ color: '#6366f1', width: 2, dash: '5 5' });
    // clearing via explicit undefined: present key with undefined deletes that style prop (missing key retains)
    const rf2 = flowSpecToRF(spec);
    (rf2.nodes[0]!.data as Record<string, unknown>).icon = undefined; // lib type gap: RFNode.data narrowing for dynamic key deletion in test
    expect(rf2.nodes[0]!.data.icon).toBeUndefined();
    expect('icon' in rf2.nodes[0]!.data).toBe(true);
    (rf2.edges[0]!.data as Record<string, unknown>).width = undefined; // lib type gap: RFEdge.data narrowing for dynamic key deletion in test
    expect((rf2.edges[0]!.data as Record<string, unknown>).width).toBeUndefined(); // lib type gap: RFEdge.data narrowing for in check
    expect('width' in (rf2.edges[0]!.data as Record<string, unknown>)).toBe(true);
    const back2 = rfToFlowSpec(rf2, spec);
    expect(back2.nodes[0]!.style).toEqual({ color: '#ff0000', bgColor: '#00ff00' });
    expect(back2.nodes[0]!.style).not.toHaveProperty('icon');
    expect(back2.edges[0]!.style).toEqual({ color: '#6366f1', dash: '5 5' });
    expect(back2.edges[0]!.style).not.toHaveProperty('width');
  });

  it('partial update preserves other style keys', () => {
    const spec = {
      ...flowSpecExample,
      nodes: [
        {
          id: 'a',
          kind: 'goal' as const,
          label: 'Goal',
          style: { color: '#111111', bgColor: '#222222', icon: 'Star' },
        },
        { id: 'b', kind: 'branch' as const, label: 'Branch' },
      ],
      rootId: 'a',
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          kind: 'sequence' as const,
          directed: true as const,
          style: { color: '#333333', width: 3, dash: '4 4' },
        },
      ],
    };
    // Partial update: change only color, missing bgColor/dash should retain prev values
    const rfPartial = flowSpecToRF(spec);
    rfPartial.nodes[0]!.data.color = '#ff0000';
    delete (rfPartial.nodes[0]!.data as Record<string, unknown>).bgColor; // lib type gap: RFNode.data narrowing for missing-key retain test
    expect('bgColor' in rfPartial.nodes[0]!.data).toBe(false);
    const backNodes = rfToFlowSpec(rfPartial, spec);
    expect(backNodes.nodes[0]!.style).toEqual({
      color: '#ff0000',
      bgColor: '#222222',
      icon: 'Star',
    });
    // Edge: change color, missing dash should retain
    rfPartial.edges[0]!.data!.color = '#00ff00';
    delete (rfPartial.edges[0]!.data as Record<string, unknown>).dash; // lib type gap: RFEdge.data narrowing for missing-key retain test
    expect('dash' in (rfPartial.edges[0]!.data as Record<string, unknown>)).toBe(false);
    const backEdges = rfToFlowSpec(rfPartial, spec);
    expect(backEdges.edges[0]!.style).toEqual({ color: '#00ff00', width: 3, dash: '4 4' });
    // Explicit undefined deletes
    const rfDelete = flowSpecToRF(spec);
    (rfDelete.nodes[0]!.data as Record<string, unknown>).icon = undefined; // lib type gap: RFNode.data narrowing for explicit undefined delete
    expect('icon' in rfDelete.nodes[0]!.data).toBe(true);
    const backDelete = rfToFlowSpec(rfDelete, spec);
    expect(backDelete.nodes[0]!.style).toEqual({ color: '#111111', bgColor: '#222222' });
    expect(backDelete.nodes[0]!.style).not.toHaveProperty('icon');
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
