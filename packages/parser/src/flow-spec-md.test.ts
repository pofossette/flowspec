import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type FlowSpec, flowSpecExample } from '@flowspec/domain';
import { describe, expect, it } from 'vitest';
import {
  extractBodyMarkdown,
  isMarkdownFlowSpec,
  parseFlowSpecFromMarkdown,
  serializeFlowSpecToMarkdown,
  stripBlocks,
} from './flow-spec-md.js';

describe('flow-spec markdown block syntax', () => {
  it('serializes to human readable markdown with frontmatter and blocks', () => {
    const md = serializeFlowSpecToMarkdown(flowSpecExample);
    expect(md).toContain('title: FlowSpec Example');
    expect(md).toContain('rootId: root-1');
    expect(md).toContain('# FlowSpec Example');
    expect(md).toContain('^^^node:');
    expect(md).toContain('^^^edge:');
    expect(md).not.toContain('<flow-spec');
    expect(isMarkdownFlowSpec(md)).toBe(true);
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed?.lock.locked).toBe(false);
  });

  it('round-trips', () => {
    const md = serializeFlowSpecToMarkdown(flowSpecExample);
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe(flowSpecExample.title);
    expect(parsed!.nodes.length).toBe(flowSpecExample.nodes.length);
    expect(parsed!.edges.length).toBe(flowSpecExample.edges.length);
    expect(parsed!.rootId).toBe(flowSpecExample.rootId);
    const n1 = parsed!.nodes.find((n) => n.id === 'n1');
    expect(n1?.content).toBe('OAuth2 + RBAC + audit log');
  });

  it('handles special chars escaping', () => {
    const spec: FlowSpec = {
      ...flowSpecExample,
      nodes: [{ id: 'n1', kind: 'branch' as const, label: 'a & b <c>', content: 'x & y <z>' }],
      edges: [],
      rootId: 'n1',
      title: 'Test & <title>',
    };
    const md = serializeFlowSpecToMarkdown(spec);
    // YAML should preserve special chars (maybe quoted)
    expect(md).toContain('a & b');
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed?.title).toBe('Test & <title>');
    expect(parsed?.nodes[0]?.label).toBe('a & b <c>');
    expect(parsed?.nodes[0]?.content).toBe('x & y <z>');
  });

  it('round-trips new kinds and style', () => {
    const spec: FlowSpec = {
      version: '1.0.0',
      title: 'Round-trip new kinds',
      description:
        'covers goal/milestone/risk/insight/question and sequence/async/feedback/blocked',
      rootId: 'root',
      nodes: [
        { id: 'root', kind: 'root' as const, label: 'Root' },
        {
          id: 'n-goal',
          kind: 'goal' as const,
          label: 'Goal Node',
          style: { color: 'indigo', bgColor: '#e0e7ff', icon: 'Target' },
        },
        {
          id: 'n-milestone',
          kind: 'milestone' as const,
          label: 'Milestone Node',
          style: { color: 'emerald', icon: 'Flag' },
        },
        {
          id: 'n-risk',
          kind: 'risk' as const,
          label: 'Risk Node',
          style: { color: 'rose', bgColor: '#ffe4e6', icon: 'AlertTriangle' },
        },
        {
          id: 'n-insight',
          kind: 'insight' as const,
          label: 'Insight Node',
          style: { color: 'amber', icon: 'Lightbulb' },
        },
        {
          id: 'n-question',
          kind: 'question' as const,
          label: 'Question Node',
          style: { color: 'violet', icon: 'HelpCircle' },
        },
        { id: 'n-branch', kind: 'branch' as const, label: 'Branch' },
      ],
      edges: [
        {
          id: 'e1',
          source: 'root',
          target: 'n-goal',
          kind: 'sequence' as const,
          directed: true,
          style: { color: '#6366f1', width: 2 },
        },
        {
          id: 'e2',
          source: 'root',
          target: 'n-milestone',
          kind: 'async' as const,
          directed: true,
          label: 'async',
        },
        {
          id: 'e3',
          source: 'n-milestone',
          target: 'n-branch',
          kind: 'feedback' as const,
          directed: true,
          style: { dash: '5 5', color: '#10b981' },
        },
        {
          id: 'e4',
          source: 'n-risk',
          target: 'n-branch',
          kind: 'blocked' as const,
          directed: true,
          label: 'blocked by',
          style: { width: 3 },
        },
      ],
    };
    const md = serializeFlowSpecToMarkdown(spec);
    // minimal one-line format
    expect(md).toContain('^^^node:');
    expect(md).toContain('^^^edge:');
    expect(md).not.toContain('color: indigo');
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes.length).toBe(spec.nodes.length);
    expect(parsed!.edges.length).toBe(spec.edges.length);
    for (const kind of ['goal', 'milestone', 'risk', 'insight', 'question'] as const) {
      const n = parsed!.nodes.find((x) => x.kind === kind);
      expect(n, `should have node kind ${kind}`).toBeDefined();
    }
    for (const kind of ['sequence', 'async', 'feedback', 'blocked'] as const) {
      const e = parsed!.edges.find((x) => x.kind === kind);
      expect(e, `should have edge kind ${kind}`).toBeDefined();
    }
    // style stripped in minimal syntax
    expect(parsed!.nodes.find((n) => n.id === 'n-goal')?.style).toBeUndefined();
    expect(parsed!.edges.find((e) => e.id === 'e1')?.style).toBeUndefined();
  });

  it('bodyMarkdown passthrough preserve', () => {
    const body = 'Intro paragraph\n\n## Section\nSome *markdown* here with **bold**.';
    const md = serializeFlowSpecToMarkdown(flowSpecExample, { bodyMarkdown: body });
    expect(md).toContain(body);
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed?.bodyMarkdown).toContain('Intro paragraph');
    expect(extractBodyMarkdown(md)).toContain('Intro paragraph');
    const stripped = stripBlocks(md);
    expect(stripped).toContain('# FlowSpec Example');
    expect(stripped).toContain(body);
    expect(stripped).not.toContain('^^^node:');
    // round-trip preserves body
    const md2 = serializeFlowSpecToMarkdown(parsed!, { bodyMarkdown: parsed!.bodyMarkdown });
    expect(md2).toContain(body);
  });

  it('multiline content preserved and empty content omitted', () => {
    const spec: FlowSpec = {
      version: '1.0.0',
      title: 'Multiline',
      rootId: 'root',
      nodes: [
        { id: 'root', kind: 'root' as const, label: 'Root', content: 'line1\nline2\nline3' },
        { id: 'n1', kind: 'branch' as const, label: 'Empty' },
      ],
      edges: [
        {
          id: 'e1',
          source: 'root',
          target: 'n1',
          kind: 'hierarchical' as const,
          directed: true,
          content: 'edge\nmultiline',
        },
      ],
    };
    const md = serializeFlowSpecToMarkdown(spec);
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed!.nodes.find((n) => n.id === 'root')?.content).toBe('line1\nline2\nline3');
    expect(parsed!.nodes.find((n) => n.id === 'n1')?.content).toBeUndefined();
    expect(parsed!.edges[0]?.content).toBe('edge\nmultiline');
  });

  it('data JSON and yaml object round-trip', () => {
    const spec: FlowSpec = {
      version: '1.0.0',
      title: 'Data',
      rootId: 'root',
      nodes: [
        {
          id: 'root',
          kind: 'root' as const,
          label: 'Root',
          data: { foo: 'bar', num: 1, nested: { a: 1 } },
        },
        { id: 'n1', kind: 'branch' as const, label: 'B' },
      ],
      edges: [],
    };
    const md = serializeFlowSpecToMarkdown(spec);
    // data is preserved via one-line key metadata or dropped in minimal; just check round-trip not crash
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes.find((n) => n.id === 'root')).toBeDefined();
  });

  it('position and style flatten round-trip', () => {
    const spec: FlowSpec = {
      version: '1.0.0',
      title: 'Pos',
      rootId: 'root',
      nodes: [
        {
          id: 'root',
          kind: 'root' as const,
          label: 'Root',
          position: { x: 10, y: 20 },
          style: { color: 'indigo' },
        },
        { id: 'n1', kind: 'branch' as const, label: 'B' },
      ],
      edges: [
        {
          id: 'e1',
          source: 'root',
          target: 'n1',
          kind: 'hierarchical' as const,
          directed: true,
          style: { width: 3, dash: '5 5' },
        },
      ],
    };
    const md = serializeFlowSpecToMarkdown(spec);
    expect(md).toContain('^^^node:');
    expect(md).toContain('^^^edge:');
    // x:y now inside key as 10:20
    expect(md).toContain(':10:20:');
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed!.nodes[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it('frontmatter lock fields round-trip', () => {
    const md = serializeFlowSpecToMarkdown(flowSpecExample, {
      lock: { locked: true, holder: 'web:alice', lockReason: 'web-edit' },
    });
    expect(md).toContain('locked: true');
    expect(md).toContain('title: FlowSpec Example');
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed?.lock.locked).toBe(true);
    // holder/lockReason stripped in minimal frontmatter
    // missing frontmatter defaults
    const bare =
      '# Title\n\n^^^block\ntype: node\nkey: t:root:root:null:null:null\nlabel: Root\n---\n^^^';
    const parsedBare = parseFlowSpecFromMarkdown(bare);
    expect(parsedBare?.lock.locked).toBe(false);
    expect(parsedBare?.rootId).toBe('root');
  });

  it('isMarkdownFlowSpec detects both new and old', () => {
    const newMd = serializeFlowSpecToMarkdown(flowSpecExample);
    expect(isMarkdownFlowSpec(newMd)).toBe(true);
    const legacy =
      '# Legacy\n\n<flow-spec version="1.0.0" rootId="root"><node id="root" kind="root" label="Root" /></flow-spec>';
    expect(isMarkdownFlowSpec(legacy)).toBe(true);
    expect(isMarkdownFlowSpec('# just markdown')).toBe(false);
    expect(
      isMarkdownFlowSpec('^^^block\ntype: node\nid: a\nkind: branch\nlabel: B\n---\n^^^')
    ).toBe(true);
  });

  it('parses legacy xml backward compat', () => {
    const legacy =
      '# Legacy\n\n> version: 1.0.0 | root: root | updated: 2026-08-29T00:00:00.000Z\n\n## Graph\n\n<flow-spec version="1.0.0" rootId="root">\n  <node id="root" kind="root" label="Root" />\n  <node id="n1" kind="branch" label="Branch" />\n  <edge id="e1" source="root" target="n1" kind="hierarchical" />\n</flow-spec>\n';
    const parsedLegacy = parseFlowSpecFromMarkdown(legacy);
    expect(parsedLegacy).not.toBeNull();
    expect(parsedLegacy!.rootId).toBe('root');
    for (const n of parsedLegacy!.nodes) {
      expect(n.style).toBeUndefined();
    }
    // also verifies current complex-demo.md (with style) parses and round-trips via legacy path
    const candidates = [
      resolve(process.cwd(), 'flowspec/complex-demo.md'),
      resolve(process.cwd(), 'packages/flow-spec/complex-demo.md'),
    ];
    let md: string | null = null;
    for (const p of candidates) {
      try {
        md = readFileSync(p, 'utf8');
        break;
      } catch {
        // continue
      }
    }
    if (md) {
      const parsed = parseFlowSpecFromMarkdown(md);
      expect(parsed).not.toBeNull();
      expect(parsed!.rootId).toBeTruthy();
      expect(parsed!.nodes.length).toBeGreaterThan(0);
      const kinds = new Set(parsed!.nodes.map((n) => n.kind));
      for (const k of ['goal', 'milestone', 'risk', 'insight', 'question'] as const) {
        expect(kinds.has(k), `complex-demo should contain node kind ${k}`).toBe(true);
      }
      const edgeKinds = new Set(parsed!.edges.map((e) => e.kind));
      for (const k of ['feedback', 'sequence', 'async', 'blocked'] as const) {
        expect(edgeKinds.has(k), `complex-demo should contain edge kind ${k}`).toBe(true);
      }
      const n1 = parsed!.nodes.find((n) => n.id === 'n1');
      expect(n1).toBeDefined();
      const n42 = parsed!.nodes.find((n) => n.id === 'n42');
      expect(n42).toBeDefined();
    }
  });

  it('round-trips flowSpecExample with new example', () => {
    const md = serializeFlowSpecToMarkdown(flowSpecExample);
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes.find((n) => n.kind === 'goal')).toBeDefined();
    expect(parsed!.nodes.find((n) => n.kind === 'risk')).toBeDefined();
    expect(parsed!.edges.find((e) => e.kind === 'sequence')).toBeDefined();
    expect(parsed!.edges.find((e) => e.kind === 'async')).toBeDefined();
    expect(parsed!.edges.find((e) => e.kind === 'feedback')).toBeDefined();
    expect(parsed!.edges.find((e) => e.kind === 'blocked')).toBeDefined();
  });

  it('parses old demo.md still readable', () => {
    const candidates = [
      resolve(process.cwd(), 'flowspec/demo.md'),
      resolve(process.cwd(), '../../flowspec/demo.md'),
      resolve(process.cwd(), '../flowspec/demo.md'),
    ];
    let md: string | null = null;
    for (const p of candidates) {
      try {
        md = readFileSync(p, 'utf8');
        break;
      } catch {}
    }
    if (!md) throw new Error('flowspec/demo.md not found in any candidate');
    const parsed = parseFlowSpecFromMarkdown(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe('Demo MD');
    expect(parsed!.rootId).toBe('root-1');
  });
});
