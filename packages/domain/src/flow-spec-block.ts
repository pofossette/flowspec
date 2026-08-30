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

function parseCompositeKey(rawVal: unknown):
  | { metadata: string; id: string; type: string; x?: number; y?: number; targetid?: string }
  | null {
  const s = toStringVal(rawVal);
  if (!s || !s.includes(':')) return null;
  const parts = s.split(':');
  // expect 6 parts metadata:id:type:x:y:targetid (targetid may contain : if metadata has, so last is targetid)
  if (parts.length < 6) return null;
  // join extra metadata colons if any: metadata may contain :? we take first as metadata, last 5 as id,type,x,y,targetid
  // Simpler: exactly 6
  if (parts.length !== 6) return null;
  const [metadata, id, type, xRaw, yRaw, targetid] = parts as [string, string, string, string, string, string];
  const x = xRaw !== 'null' && xRaw !== '' ? Number(xRaw) : undefined;
  const y = yRaw !== 'null' && yRaw !== '' ? Number(yRaw) : undefined;
  return {
    metadata,
    id,
    type,
    x: x !== undefined && !Number.isNaN(x) ? x : undefined,
    y: y !== undefined && !Number.isNaN(y) ? y : undefined,
    targetid: targetid === 'null' ? undefined : targetid,
  };
}

export function rawBlockToNode(raw: Record<string, unknown>, content: string): FlowNode | null {
  // new key: metadata:id:type:x:y:targetid  (preferred, id field deprecated)
  const composite = parseCompositeKey(raw.key ?? raw.id);
  let id: string | undefined;
  let kind: FlowNode['kind'];
  let position: { x: number; y: number } | undefined;
  let metadata: string | undefined;
  if (composite && composite.targetid === undefined) {
    // node: target null
    metadata = composite.metadata;
    id = composite.id;
    kind = (composite.type as FlowNode['kind']) ?? 'branch';
    if (composite.x !== undefined && composite.y !== undefined) position = { x: composite.x, y: composite.y };
  } else {
    // fallback to legacy fields (or composite with target? treat as legacy node)
    if (composite) {
      metadata = composite.metadata;
      id = composite.id;
      kind = (composite.type as FlowNode['kind']) ?? 'branch';
      if (composite.x !== undefined && composite.y !== undefined) position = { x: composite.x, y: composite.y };
    } else {
      id = toStringVal(raw.id ?? raw.key);
      kind = (toStringVal(raw.kind) as FlowNode['kind']) ?? 'branch';
      const x = toNumberVal(raw.x);
      const y = toNumberVal(raw.y);
      position = x !== undefined && y !== undefined ? { x, y } : undefined;
    }
  }
  // label priority: explicit label > metadata
  const label = toStringVal(raw.label) ?? metadata;
  if (!id || !label) return null;
  const status = toStringVal(raw.status) as FlowNode['status'] | undefined;
  const collapsedRaw = raw.collapsed;
  const collapsed = collapsedRaw === true || collapsedRaw === 'true' ? true : undefined;

  // legacy style ignored for minimal syntax, but keep if present
  const color = toStringVal(raw.color);
  const bgColor = toStringVal(raw.bgColor);
  const icon = toStringVal(raw.icon);
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
  const dataRaw = raw.data;
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
  if (metadata && metadata !== id) {
    data = { ...(data ?? {}), metadata };
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
  const composite = parseCompositeKey(raw.key ?? raw.id);
  let id: string | undefined;
  let source: string | undefined;
  let target: string | undefined;
  let kind: FlowEdge['kind'];
  let label: string | undefined;
  if (composite && composite.targetid !== undefined) {
    // edge: metadata is source, id is edgeId, type is kind, targetid is target
    // also support metadata as label if needed — but for edge we treat metadata as source
    source = composite.metadata;
    id = composite.id;
    kind = (composite.type as FlowEdge['kind']) ?? 'hierarchical';
    target = composite.targetid;
    label = toStringVal(raw.label);
    // x,y ignored for edge (reserved)
  } else {
    id = composite ? composite.id : toStringVal(raw.id ?? raw.key);
    source = toStringVal(raw.source);
    target = composite ? composite.targetid : toStringVal(raw.target);
    // if composite targetid missing, fallback
    if (!target && composite) target = composite.targetid;
    if (composite) {
      kind = (composite.type as FlowEdge['kind']) ?? 'hierarchical';
    } else {
      kind = (toStringVal(raw.kind) as FlowEdge['kind']) ?? 'hierarchical';
    }
    label = toStringVal(raw.label);
    // if label missing and composite metadata available, use it
    if (!label && composite) label = composite.metadata !== id ? composite.metadata : undefined;
  }
  if (!id || !source || !target) return null;
  const directedRaw = raw.directed;
  const directed = !(directedRaw === false || directedRaw === 'false');
  const color = toStringVal(raw.color);
  const width = toNumberVal(raw.width);
  const dash = toStringVal(raw.dash);
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
  // minimal key: metadata:id:type:x:y:targetid  (target null for node)
  const x = node.position?.x;
  const y = node.position?.y;
  const xStr = x !== undefined ? String(x) : 'null';
  const yStr = y !== undefined ? String(y) : 'null';
  const metadata = (node.data as Record<string, unknown> | undefined)?.metadata as string | undefined;
  const meta = metadata ?? node.id;
  const key = `${meta}:${node.id}:${node.kind}:${xStr}:${yStr}:null`;
  const out: Record<string, unknown> = {
    type: 'node',
    key,
    label: node.label,
  };
  if (node.status) out.status = node.status;
  if (node.collapsed) out.collapsed = true;
  // style/color stripped for minimal syntax; keep data except metadata
  if (node.data && Object.keys(node.data).length > 0) {
    const { metadata: _m, ...rest } = node.data as Record<string, unknown>;
    if (Object.keys(rest).length > 0) out.data = rest;
  }
  return out;
}

export function edgeToYamlHead(edge: FlowEdge): Record<string, unknown> {
  // minimal key: metadata(source):id:type:x:y:targetid
  const key = `${edge.source}:${edge.id}:${edge.kind}:0:0:${edge.target}`;
  const out: Record<string, unknown> = {
    type: 'edge',
    key,
  };
  if (edge.label) out.label = edge.label;
  if (edge.directed === false) out.directed = false;
  // style stripped for minimal
  return out;
}

export function stringifyYamlHead(obj: Record<string, unknown>): string {
  // Use yaml.stringify but trim trailing newline
  const s = yaml.stringify(obj).trimEnd();
  return s;
}
