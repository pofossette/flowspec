import * as yaml from 'yaml';
import type { FlowEdge, FlowNode } from './flow-spec.js';

export type BlockType = 'node' | 'edge';

export interface RawBlock {
  type: BlockType;
  yaml: Record<string, unknown>;
  content: string;
}

export function parseYamlHead(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try {
    const parsed = yaml.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function toStringVal(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function toNumberVal(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  return n;
}

export function rawBlockToNode(raw: Record<string, unknown>, content: string): FlowNode | null {
  const id = toStringVal(raw['id']);
  const label = toStringVal(raw['label']);
  if (!id || !label) return null;
  const kind = (toStringVal(raw['kind']) as FlowNode['kind']) ?? 'branch';
  const status = toStringVal(raw['status']) as FlowNode['status'] | undefined;
  const collapsedRaw = raw['collapsed'];
  const collapsed = collapsedRaw === true || collapsedRaw === 'true' ? true : undefined;

  const x = toNumberVal(raw['x']);
  const y = toNumberVal(raw['y']);
  const position = x !== undefined && y !== undefined ? { x, y } : undefined;

  const color = toStringVal(raw['color']);
  const bgColor = toStringVal(raw['bgColor']);
  const icon = toStringVal(raw['icon']);
  const style =
    color !== undefined || bgColor !== undefined || icon !== undefined
      ? {
          ...(color !== undefined ? { color } : {}),
          ...(bgColor !== undefined ? { bgColor } : {}),
          ...(icon !== undefined ? { icon } : {}),
        }
      : undefined;

  // data: JSON string or object
  let data: Record<string, unknown> | undefined;
  const dataRaw = raw['data'];
  if (dataRaw !== undefined) {
    if (typeof dataRaw === 'object' && dataRaw !== null && !Array.isArray(dataRaw)) {
      data = dataRaw as Record<string, unknown>;
    } else if (typeof dataRaw === 'string') {
      const trimmed = dataRaw.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            data = parsed as Record<string, unknown>;
          }
        } catch {
          // try yaml parse as fallback for simple object string
          try {
            const y = yaml.parse(trimmed);
            if (y && typeof y === 'object' && !Array.isArray(y))
              data = y as Record<string, unknown>;
          } catch {
            // ignore
          }
        }
      }
    }
  }

  const trimmedContent = content.trim();
  const node: FlowNode = {
    id,
    kind,
    label,
    ...(status ? { status } : {}),
    ...(collapsed ? { collapsed } : {}),
    ...(position ? { position } : {}),
    ...(style ? { style } : {}),
    ...(trimmedContent ? { content: trimmedContent } : {}),
    ...(data ? { data } : {}),
  };
  return node;
}

export function rawBlockToEdge(raw: Record<string, unknown>, content: string): FlowEdge | null {
  const id = toStringVal(raw['id']);
  const source = toStringVal(raw['source']);
  const target = toStringVal(raw['target']);
  if (!id || !source || !target) return null;
  const kind = (toStringVal(raw['kind']) as FlowEdge['kind']) ?? 'hierarchical';
  const label = toStringVal(raw['label']);
  const directedRaw = raw['directed'];
  const directed = directedRaw === false || directedRaw === 'false' ? false : true;
  const color = toStringVal(raw['color']);
  const width = toNumberVal(raw['width']);
  const dash = toStringVal(raw['dash']);
  const style =
    color !== undefined || width !== undefined || dash !== undefined
      ? {
          ...(color !== undefined ? { color } : {}),
          ...(width !== undefined ? { width } : {}),
          ...(dash !== undefined ? { dash } : {}),
        }
      : undefined;
  const trimmedContent = content.trim();
  // edge has no data field per flow-spec.ts — explicitly drop any data payload
  const edge: FlowEdge = {
    id,
    source,
    target,
    kind,
    ...(label ? { label } : {}),
    ...(trimmedContent ? { content: trimmedContent } : {}),
    directed,
    ...(style ? { style } : {}),
  };
  return edge;
}

export function nodeToYamlHead(node: FlowNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: 'node',
    id: node.id,
    kind: node.kind,
    label: node.label,
  };
  if (node.status) out['status'] = node.status;
  if (node.collapsed) out['collapsed'] = true;
  if (node.position) {
    out['x'] = node.position.x;
    out['y'] = node.position.y;
  }
  if (node.style?.color) out['color'] = node.style.color;
  if (node.style?.bgColor) out['bgColor'] = node.style.bgColor;
  if (node.style?.icon) out['icon'] = node.style.icon;
  if (node.data && Object.keys(node.data).length > 0) {
    out['data'] = node.data;
  }
  return out;
}

export function edgeToYamlHead(edge: FlowEdge): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: 'edge',
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
  };
  if (edge.label) out['label'] = edge.label;
  if (edge.directed === false) out['directed'] = false;
  if (edge.style?.color) out['color'] = edge.style.color;
  if (edge.style?.width !== undefined) out['width'] = edge.style.width;
  if (edge.style?.dash) out['dash'] = edge.style.dash;
  // content is not in YAML, it's markdown body
  return out;
}

export function stringifyYamlHead(obj: Record<string, unknown>): string {
  // Use yaml.stringify but trim trailing newline
  const s = yaml.stringify(obj).trimEnd();
  return s;
}
