import type { FlowEdge, FlowNode, FlowSpec } from '@flowspec/domain';
import { flowSpecSchema } from '@flowspec/domain';
import * as yaml from 'yaml';
import {
  edgeToYamlHead,
  nodeToYamlHead,
  parseYamlHead,
  rawBlockToEdge,
  rawBlockToNode,
} from './flow-spec-block.js';

// ---------------------------------------------------------------------------
// Legacy XML helpers — kept for backward compat
// ---------------------------------------------------------------------------

function escAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
function escText(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function unesc(s: string): string {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

function formatIsoNow(): string {
  return new Date().toISOString();
}

function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    const key = m[1]!;
    const val = m[2]!;
    out[key] = unesc(val);
  }
  return out;
}

function extractTagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const reSelf = new RegExp(`<${tag}\\b[^>]*\\/\\s*>`, 'g');
  const rePair = new RegExp(`<${tag}\\b[^>]*[^\\/]>[\\s\\S]*?<\\/${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = reSelf.exec(xml))) blocks.push(m[0]!);
  while ((m = rePair.exec(xml))) blocks.push(m[0]!);
  return blocks;
}

function parseNodeBlock(block: string): FlowNode | null {
  const headMatch = block.match(/<node\b[^>]*>/);
  if (!headMatch) return null;
  const attrs = parseAttrs(headMatch[0]!);
  const id = attrs.id;
  const kind = (attrs.kind as FlowNode['kind']) ?? 'branch';
  const label = attrs.label;
  if (!id || !label) return null;
  const status = attrs.status as FlowNode['status'] | undefined;
  const collapsed = attrs.collapsed === 'true' ? true : undefined;
  const x = attrs.x !== undefined ? Number(attrs.x) : undefined;
  const y = attrs.y !== undefined ? Number(attrs.y) : undefined;
  const position =
    x !== undefined && y !== undefined && !Number.isNaN(x) && !Number.isNaN(y)
      ? { x, y }
      : undefined;
  const color = attrs.color;
  const bgColor = attrs.bgColor;
  const icon = attrs.icon;
  const style =
    color !== undefined || bgColor !== undefined || icon !== undefined
      ? {
          ...(color !== undefined ? { color } : {}),
          ...(bgColor !== undefined ? { bgColor } : {}),
          ...(icon !== undefined ? { icon } : {}),
        }
      : undefined;

  let content: string | undefined;
  const cMatch = block.match(/<content>([\s\S]*?)<\/content>/);
  if (cMatch) content = unesc(cMatch[1]?.trim());

  let data: Record<string, unknown> | undefined;
  const dMatch = block.match(/<data>([\s\S]*?)<\/data>/);
  if (dMatch) {
    const raw = unesc(dMatch[1]?.trim());
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  const node: FlowNode = {
    id,
    kind,
    label,
    ...(status ? { status } : {}),
    ...(collapsed ? { collapsed } : {}),
    ...(position ? { position } : {}),
    ...(style ? { style } : {}),
    ...(content ? { content } : {}),
    ...(data ? { data } : {}),
  };
  return node;
}

function parseEdgeBlock(block: string): FlowEdge | null {
  const m = block.match(/<edge\b[^>]*\/?>/);
  if (!m) return null;
  const attrs = parseAttrs(m[0]!);
  const id = attrs.id;
  const source = attrs.source;
  const target = attrs.target;
  if (!id || !source || !target) return null;
  const kind = (attrs.kind as FlowEdge['kind']) ?? 'hierarchical';
  const label = attrs.label;
  const directed = attrs.directed !== 'false';
  const edgeColor = attrs.color;
  const widthRaw = attrs.width;
  const dash = attrs.dash;
  const width = widthRaw !== undefined ? Number(widthRaw) : undefined;
  const style =
    edgeColor !== undefined || (width !== undefined && !Number.isNaN(width)) || dash !== undefined
      ? {
          ...(edgeColor !== undefined ? { color: edgeColor } : {}),
          ...(width !== undefined && !Number.isNaN(width) ? { width } : {}),
          ...(dash !== undefined ? { dash } : {}),
        }
      : undefined;
  let content: string | undefined;
  const cMatch = block.match(/<content>([\s\S]*?)<\/content>/);
  if (cMatch) content = unesc(cMatch[1]?.trim());
  return {
    id,
    source,
    target,
    kind,
    ...(label ? { label } : {}),
    ...(content ? { content } : {}),
    directed,
    ...(style ? { style } : {}),
  };
}

// ---------------------------------------------------------------------------
// New block syntax helpers
// ---------------------------------------------------------------------------

export interface FlowSpecLock {
  locked: boolean;
  holder?: string;
  /** optional note attached to lock (mirrors LockInfo.note) */
  note?: string;
  lockReason?: string;
  acquiredAt?: string;
  expiresAt?: string;
  version?: string;
  rootId?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ParsedFlowSpec = FlowSpec & {
  lock: FlowSpecLock;
  bodyMarkdown: string;
};

export interface SerializeOptions {
  bodyMarkdown?: string;
  lock?: Partial<FlowSpecLock>;
}

/**
 * Frontmatter is authoritative for lock state when present; file-lock.ts helpers
 * (LockInfo file) will defer to frontmatter in Task 2. For now we document that
 * frontmatter wins and parse the superset that covers both lock files and spec meta.
 */
function parseFrontmatter(md: string): {
  lock: FlowSpecLock;
  remaining: string;
  rawFrontmatter: Record<string, unknown> | null;
} {
  // Support CRLF frontmatter delim: ---\r?\n ... \r?\n---\r?\n
  const fmRe = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/;
  const match = md.match(fmRe);
  if (!match) {
    return {
      lock: { locked: false, version: '1.0.0' },
      remaining: md,
      rawFrontmatter: null,
    };
  }
  const yamlContent = match[1] ?? '';
  let parsed: Record<string, unknown> = {};
  try {
    const y = yaml.parse(yamlContent);
    if (y && typeof y === 'object' && !Array.isArray(y)) parsed = y as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const lockedRaw = parsed.locked;
  const locked = lockedRaw === true || lockedRaw === 'true';
  const lock: FlowSpecLock = {
    locked,
    ...(typeof parsed.title === 'string' && parsed.title ? { title: parsed.title } : {}),
    ...(typeof parsed.rootId === 'string' && parsed.rootId ? { rootId: parsed.rootId } : {}),
    // keep minimal; version/timestamps dropped, keep for compat if present
    ...(typeof parsed.version === 'string' && parsed.version ? { version: parsed.version } : {}),
  };
  const remaining = md.slice(match[0]?.length);
  return { lock, remaining, rawFrontmatter: parsed };
}

function serializeFrontmatter(lock: FlowSpecLock): string {
  const obj: Record<string, unknown> = {};
  if (lock.title) obj.title = lock.title;
  if (lock.rootId) obj.rootId = lock.rootId;
  if (lock.locked) obj.locked = true;
  const y = yaml.stringify(obj).trimEnd();
  return `---\n${y}\n---\n`;
}

const BLOCK_RE = /^\^\^\^block[ \t]*\r?\n([\s\S]*?)\r?\n\^\^\^[ \t]*$/gm;
// one-line: ^^^node:metadata:id:kind:x:y:targetid[:label[:status]]  or ^^^edge:source:edgeId:kind:0:0:target[:label]
const ONE_LINE_RE = /^\^\^\^(?:block-)?(node|edge):([^\n]*)\r?\n([\s\S]*?)\r?\n\^\^\^[ \t]*$/gm;
// combined for stripping body (both formats)
const ALL_BLOCK_RE =
  /^(?:\^\^\^block[ \t]*\r?\n[\s\S]*?\r?\n\^\^\^[ \t]*|\^\^\^(?:block-)?(?:node|edge):[^\n]*\r?\n[\s\S]*?\r?\n\^\^\^[ \t]*)/gm;
function createBlockRe(): RegExp {
  return new RegExp(BLOCK_RE.source, 'gm');
}
function _createOneLineRe(): RegExp {
  return new RegExp(ONE_LINE_RE.source, 'gm');
}
function _createAllBlockRe(): RegExp {
  return new RegExp(ALL_BLOCK_RE.source, 'gm');
}

export interface ParsedBlocks {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

function _parseOneLineHeader(header: string): {
  type: 'node' | 'edge';
  raw: Record<string, unknown>;
} | null {
  const trimmed = header.trim();
  // header is like: metadata:id:kind:x:y:targetid[:label[:status]]
  // For node: metadata is opaque, target null; for edge: metadata is source
  const firstColon = trimmed.indexOf(':');
  if (firstColon === -1) return null;
  // we already stripped leading type via regex, so header is the rest after "node:" / "edge:"
  // But our caller passes the part after "node:" inclusive, so header is "metadata:id:kind:x:y:targetid[:label[:status]]"
  const parts = trimmed.split(':');
  if (parts.length < 6) return null;
  // last parts may be label/status containing colons, so we need to isolate
  // parts[0]=metadata, 1=id, 2=kind, 3=x, 4=y, 5=targetid, 6...=label/status
  const [metadata, id, kind, xRaw, yRaw, targetid, ...rest] = parts as string[];
  let label: string | undefined;
  let status: string | undefined;
  if (rest.length > 0) {
    const joined = rest.join(':');
    // check if last segment is a known status
    const knownStatus = ['todo', 'doing', 'done', 'blocked', 'idea'];
    const lastColon = joined.lastIndexOf(':');
    if (lastColon !== -1) {
      const maybeStatus = joined.slice(lastColon + 1);
      if (knownStatus.includes(maybeStatus)) {
        status = maybeStatus;
        label = joined.slice(0, lastColon) || undefined;
      } else {
        label = joined || undefined;
      }
    } else {
      // single label without colon, check if it's a status alone
      if (knownStatus.includes(joined)) status = joined;
      else label = joined || undefined;
    }
  }
  // build raw object compatible with rawBlockToNode/Edge
  // key is the 6-part composite for reuse
  const key = `${metadata}:${id}:${kind}:${xRaw}:${yRaw}:${targetid}`;
  const raw: Record<string, unknown> = { key };
  if (label) raw.label = label;
  if (status) raw.status = status;
  // type will be supplied by caller
  return { type: 'node', raw } as unknown as {
    type: 'node' | 'edge';
    raw: Record<string, unknown>;
  };
}

export function parseBlocks(md: string): ParsedBlocks {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  // 1) one-line format: ^^^node:... and ^^^edge:...  (also ^^^block-node:... )
  const lines = md.split('\n');
  let i = 0;
  const oneLineRanges: Array<[number, number]> = [];
  // Build char offset map for range tracking
  const lineOffsets: number[] = [];
  let off = 0;
  for (const line of lines) {
    lineOffsets.push(off);
    off += line.length + 1; // +1 for \n
  }
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    const mOne = trimmed.match(/^\^\^\^(?:block-)?(node|edge):(.*)$/);
    if (mOne) {
      const type = mOne[1] as 'node' | 'edge';
      const header = (mOne[2] ?? '').trim();
      const startOffset = lineOffsets[i] ?? 0;
      // collect body until next ^^^ line
      let j = i + 1;
      const bodyLines: string[] = [];
      while (j < lines.length) {
        const l = lines[j] ?? '';
        if (l.trim().startsWith('^^^')) break;
        bodyLines.push(l);
        j++;
      }
      const body = bodyLines.join('\n').trim();
      // header is metadata:id:kind:x:y:targetid[:label[:status]]
      const headerParts = header.split(':');
      if (headerParts.length >= 6) {
        const [metadata, id, kind, xRaw, yRaw, targetid, ...rest] = headerParts as string[];
        const key = `${metadata}:${id}:${kind}:${xRaw}:${yRaw}:${targetid}`;
        let label: string | undefined;
        let status: string | undefined;
        if (rest.length > 0) {
          const joined = rest.join(':');
          const knownStatus = ['todo', 'doing', 'done', 'blocked', 'idea'];
          let maybeLabel = joined;
          let maybeStatus: string | undefined;
          const lastColon = joined.lastIndexOf(':');
          if (lastColon !== -1) {
            const tail = joined.slice(lastColon + 1);
            if (knownStatus.includes(tail)) {
              maybeStatus = tail;
              maybeLabel = joined.slice(0, lastColon);
            }
          } else if (knownStatus.includes(joined)) {
            maybeStatus = joined;
            maybeLabel = '';
          }
          if (maybeLabel) label = maybeLabel;
          if (maybeStatus) status = maybeStatus;
        }
        const raw: Record<string, unknown> = { key };
        if (label) raw.label = label;
        if (status) raw.status = status;
        if (type === 'node') {
          const n = rawBlockToNode(raw, body);
          if (n) nodes.push(n);
        } else {
          const e = rawBlockToEdge(raw, body);
          if (e) edges.push(e);
        }
        const endOffset = j < lines.length ? (lineOffsets[j] ?? startOffset) : md.length;
        oneLineRanges.push([startOffset, endOffset]);
      }
      // jump to closing ^^^ line (j) and continue after it
      i = j + 1;
      continue;
    }
    i++;
  }
  // 2) legacy multi-line ^^^block
  const re = createBlockRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    // skip if inside a one-line range (overlap)
    const start = m.index!;
    if (oneLineRanges.some(([s, e]) => start >= s && start < e)) continue;
    const inner = m[1] ?? '';
    let headRaw: string;
    let body: string;
    const sepRe = /\r?\n---(?:\r?\n|$)/;
    const sepMatch = sepRe.exec(inner);
    if (sepMatch && sepMatch.index !== undefined) {
      const idx = sepMatch.index;
      const sepLen = sepMatch[0].length;
      headRaw = inner.slice(0, idx);
      body = inner.slice(idx + sepLen);
    } else if (inner.startsWith('---')) {
      headRaw = '';
      body = inner.slice(3);
      if (body.startsWith('\r\n')) body = body.slice(2);
      else if (body.startsWith('\n') || body.startsWith('\r')) body = body.slice(1);
    } else {
      headRaw = inner;
      body = '';
    }
    const yamlObj = parseYamlHead(headRaw);
    if (!yamlObj) continue;
    const type = typeof yamlObj.type === 'string' ? (yamlObj.type as string) : undefined;
    if (type === 'node') {
      const n = rawBlockToNode(yamlObj, body);
      if (n) nodes.push(n);
    } else if (type === 'edge') {
      const e = rawBlockToEdge(yamlObj, body);
      if (e) edges.push(e);
    }
  }
  return { nodes, edges };
}

function serializeBlocks(spec: FlowSpec): string[] {
  const lines: string[] = [];
  for (const n of spec.nodes) {
    const head = nodeToYamlHead(n);
    // one-line: ^^^node:metadata:id:kind:x:y:targetid[:label[:status]]
    const key = String(head.key);
    const label = String(head.label);
    const status = head.status ? `:${String(head.status)}` : '';
    // key already is metadata:id:kind:x:y:targetid, label may contain ':', keep as is
    lines.push(`^^^node:${key}:${label}${status}`);
    if (n.content) lines.push(n.content);
    lines.push('^^^');
  }
  for (const e of spec.edges) {
    const head = edgeToYamlHead(e);
    const key = String(head.key);
    const labelPart = head.label ? `:${String(head.label)}` : '';
    lines.push(`^^^edge:${key}${labelPart}`);
    if (e.content) lines.push(e.content);
    lines.push('^^^');
  }
  return lines;
}

function stripAllBlocks(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isStart =
      trimmed.startsWith('^^^block') || /^\^\^\^(?:block-)?(?:node|edge):/.test(trimmed);
    if (!inBlock && isStart) {
      inBlock = true;
      continue;
    }
    if (inBlock && trimmed === '^^^') {
      inBlock = false;
      continue;
    }
    if (!inBlock) out.push(line);
  }
  return out.join('\n');
}

/**
 * Extract markdown body that is not inside frontmatter nor blocks.
 * Body is the content between the header (title/description) and first ^^^block, plus any trailing markdown after blocks stripped? Actually spec passthrough is that bodyMarkdown is preserved verbatim.
 * We define bodyMarkdown as md without frontmatter, title, description blockquotes, and blocks.
 */
export function extractBodyMarkdown(md: string): string {
  const { remaining } = parseFrontmatter(md);
  // remove blocks to get non-block content — line-based handles both ^^^block and ^^^node/^ ^edge
  const withoutBlocks = stripAllBlocks(remaining).trim();
  // withoutBlocks still contains title + description blockquotes + body
  // We need to strip title and description blockquotes
  const lines = withoutBlocks.split('\n');
  let idx = 0;
  // skip leading empty
  while (idx < lines.length && lines[idx]?.trim() === '') idx++;
  // skip title
  if (idx < lines.length && lines[idx]?.startsWith('# ')) {
    idx++;
    // skip empty after title
    while (idx < lines.length && lines[idx]?.trim() === '') idx++;
    // skip blockquote description lines
    while (idx < lines.length && lines[idx]?.startsWith('> ')) {
      idx++;
    }
    // skip one empty after description
    while (idx < lines.length && lines[idx]?.trim() === '') {
      // only skip one? but we trim overall
      // break after first empty grouping: actually include body after
      // If there are remaining blockquote version lines, they were already covered; now idx points to body
      break;
    }
    // skip empty
    while (idx < lines.length && lines[idx]?.trim() === '') idx++;
  } else {
    // no title header: return whatever remains (could be body); for legacy files without title
    // we keep content as-is rather than clobbering on "## Graph" or "<flow-spec"
    // Body containing those strings must survive, so we don't early-return.
    // Fall through to join remaining lines.
    idx = 0;
    // Re-split without special handling: treat whole withoutBlocks as candidate body
    // But if withoutBlocks starts with legacy markers, they are part of header not body;
    // we rely on stripBlocks not heuristic — so just return trimmed withoutBlocks minus title handling
    // Since no title, there was no header to strip, so body is withoutBlocks trimmed
    // However legacy without title will return withoutBlocks itself; that's acceptable (preview shows it)
    // For backward compat, if withoutBlocks is purely legacy header, caller may get header text, but not clobbered.
    return withoutBlocks;
  }
  const body = lines.slice(idx).join('\n').trim();
  return body;
}

export function stripBlocks(md: string): string {
  // Remove frontmatter + blocks, keep header + body — line-based handles both formats
  const { remaining } = parseFrontmatter(md);
  const stripped = stripAllBlocks(remaining);
  // Collapse multiple blank lines to at most 2
  return `${stripped.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// Legacy XML serialization kept for reference but new serialize uses blocks
// ---------------------------------------------------------------------------

function serializeLegacyXml(spec: FlowSpec): string {
  const version = spec.version ?? '1.0.0';
  const updated = spec.updatedAt ?? formatIsoNow();
  const lines: string[] = [];
  lines.push(`# ${spec.title}`);
  lines.push('');
  if (spec.description) {
    for (const l of spec.description.split('\n')) lines.push(`> ${l}`);
    lines.push('');
  }
  lines.push(`> version: ${version} | root: ${spec.rootId} | updated: ${updated}`);
  if (spec.createdAt) lines.push(`> created: ${spec.createdAt}`);
  lines.push('');
  if (spec.meta && (spec.meta.author || spec.meta.tags?.length || spec.meta.specRef)) {
    lines.push('## Meta');
    lines.push('');
    if (spec.meta.author) lines.push(`- author: ${spec.meta.author}`);
    if (spec.meta.tags?.length) lines.push(`- tags: ${spec.meta.tags.join(', ')}`);
    if (spec.meta.specRef) lines.push(`- specRef: ${spec.meta.specRef}`);
    lines.push('');
  }
  lines.push('## Graph');
  lines.push('');
  lines.push(`<flow-spec version="${escAttr(version)}" rootId="${escAttr(spec.rootId)}">`);
  if (spec.meta && Object.keys(spec.meta).length > 0) {
    const attrs: string[] = [];
    if (spec.meta.author) attrs.push(`author="${escAttr(spec.meta.author)}"`);
    if (spec.meta.tags?.length) attrs.push(`tags="${escAttr(spec.meta.tags.join(','))}"`);
    if (spec.meta.specRef) attrs.push(`specRef="${escAttr(spec.meta.specRef)}"`);
    if (spec.createdAt) attrs.push(`createdAt="${escAttr(spec.createdAt)}"`);
    if (updated) attrs.push(`updatedAt="${escAttr(updated)}"`);
    if (attrs.length) lines.push(`  <meta ${attrs.join(' ')} />`);
  }
  for (const n of spec.nodes) {
    const attrs = [
      `id="${escAttr(n.id)}"`,
      `kind="${escAttr(n.kind)}"`,
      `label="${escAttr(n.label)}"`,
      ...(n.status ? [`status="${escAttr(n.status)}"`] : []),
      ...(n.collapsed ? [`collapsed="true"`] : []),
      ...(n.position ? [`x="${n.position.x}"`, `y="${n.position.y}"`] : []),
      ...(n.style?.color ? [`color="${escAttr(n.style.color)}"`] : []),
      ...(n.style?.bgColor ? [`bgColor="${escAttr(n.style.bgColor)}"`] : []),
      ...(n.style?.icon ? [`icon="${escAttr(n.style.icon)}"`] : []),
    ].join(' ');
    if (n.content || n.data) {
      lines.push(`  <node ${attrs}>`);
      if (n.content) lines.push(`    <content>${escText(n.content)}</content>`);
      if (n.data && Object.keys(n.data).length > 0) {
        lines.push(`    <data>${escText(JSON.stringify(n.data))}</data>`);
      }
      lines.push(`  </node>`);
    } else {
      lines.push(`  <node ${attrs} />`);
    }
  }
  for (const e of spec.edges) {
    const attrs = [
      `id="${escAttr(e.id)}"`,
      `source="${escAttr(e.source)}"`,
      `target="${escAttr(e.target)}"`,
      `kind="${escAttr(e.kind)}"`,
      ...(e.label ? [`label="${escAttr(e.label)}"`] : []),
      ...(e.directed === false ? [`directed="false"`] : []),
      ...(e.style?.color ? [`color="${escAttr(e.style.color)}"`] : []),
      ...(e.style?.width !== undefined ? [`width="${e.style.width}"`] : []),
      ...(e.style?.dash ? [`dash="${escAttr(e.style.dash)}"`] : []),
    ].join(' ');
    if (e.content) {
      lines.push(`  <edge ${attrs}>`);
      lines.push(`    <content>${escText(e.content)}</content>`);
      lines.push(`  </edge>`);
    } else {
      lines.push(`  <edge ${attrs} />`);
    }
  }
  lines.push(`</flow-spec>`);
  lines.push('');
  return lines.join('\n');
}

// Exposed for tests that want legacy
export function serializeLegacyMarkdown(spec: FlowSpec): string {
  return serializeLegacyXml(spec);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize FlowSpec to new block markdown format.
 * Second arg may be options object { bodyMarkdown, lock } or legacy no-arg.
 */
export function serializeFlowSpecToMarkdown(
  spec: FlowSpec,
  opts?: SerializeOptions | string
): string {
  const options: SerializeOptions =
    typeof opts === 'string' ? { bodyMarkdown: opts } : (opts ?? {});
  const lock: FlowSpecLock = {
    locked: options.lock?.locked ?? false,
    title: spec.title,
    rootId: spec.rootId,
  };

  const lines: string[] = [];
  lines.push(serializeFrontmatter(lock).trimEnd());
  lines.push('');
  lines.push(`# ${spec.title}`);
  lines.push('');
  if (spec.description) {
    for (const l of spec.description.split('\n')) lines.push(`> ${l}`);
    lines.push('');
  }
  if (options.bodyMarkdown?.trim()) {
    lines.push(options.bodyMarkdown.trim());
    lines.push('');
  }
  const blockLines = serializeBlocks(spec);
  lines.push(...blockLines);
  lines.push('');
  return lines.join('\n');
}

// Legacy parse kept
function parseLegacyXml(md: string): FlowSpec | null {
  const flowMatch = md.match(/<flow-spec\b[^>]*>([\s\S]*?)<\/flow-spec>/);
  if (!flowMatch) return null;
  const openTag = md.match(/<flow-spec\b[^>]*>/)?.[0] ?? '';
  const openAttrs = parseAttrs(openTag);
  const version = openAttrs.version ?? '1.0.0';
  const rootId = openAttrs.rootId ?? '';
  if (!rootId) return null;
  const inner = flowMatch[1] ?? '';

  let meta: FlowSpec['meta'] | undefined;
  const metaMatch = inner.match(/<meta\b[^>]*\/?>/);
  if (metaMatch) {
    const ma = parseAttrs(metaMatch[0]!);
    const tagsRaw = ma.tags;
    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    meta = {
      ...(ma.author ? { author: ma.author } : {}),
      ...(tags ? { tags } : {}),
      ...(ma.specRef ? { specRef: ma.specRef } : {}),
    };
    if (Object.keys(meta).length === 0) meta = undefined;
  }
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  if (metaMatch) {
    const ma = parseAttrs(metaMatch[0]!);
    if (ma.createdAt) createdAt = ma.createdAt;
    if (ma.updatedAt) updatedAt = ma.updatedAt;
  }

  let title = '';
  const titleMatch = md.match(/^#\s+(.+)$/m);
  if (titleMatch) title = titleMatch[1]?.trim();
  let description: string | undefined;
  const lines = md.split('\n');
  let inDesc = false;
  const descLines: string[] = [];
  let seenTitle = false;
  for (const line of lines) {
    if (!seenTitle && line.startsWith('# ')) {
      seenTitle = true;
      inDesc = true;
      continue;
    }
    if (inDesc) {
      if (line.startsWith('> ')) {
        const c = line.slice(2).trim();
        if (c.startsWith('version:') || c.startsWith('created:') || c.startsWith('root:')) continue;
        descLines.push(c);
      } else if (line.trim() === '' && descLines.length === 0) {
      } else if (line.trim() === '' || line.startsWith('## ') || line.startsWith('<flow-spec')) {
        break;
      }
    }
  }
  if (descLines.length > 0) description = descLines.join('\n');

  const nodeBlocks = extractTagBlocks(inner, 'node');
  const nodes: FlowNode[] = [];
  for (const b of nodeBlocks) {
    const n = parseNodeBlock(b);
    if (n) nodes.push(n);
  }
  const edgeBlocks = extractTagBlocks(inner, 'edge');
  const edges: FlowEdge[] = [];
  for (const b of edgeBlocks) {
    const e = parseEdgeBlock(b);
    if (e) edges.push(e);
  }

  const candidate = {
    version,
    title: title || 'Untitled',
    ...(description ? { description } : {}),
    rootId,
    nodes,
    edges,
    ...(meta ? { meta } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
  const parsed = flowSpecSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return parsed.data;
}

export function parseFlowSpecFromMarkdown(md: string): ParsedFlowSpec | null {
  // First try new block syntax if any ^^^block / ^^^node / ^^^edge present (anchored)
  const hasBlocks = BLOCK_DETECT_RE.test(md) || ONE_LINE_DETECT_RE.test(md);
  const { lock, remaining } = parseFrontmatter(md);

  // Title / description extraction from remaining (without frontmatter)
  let title = lock.title ?? '';
  const titleMatch = remaining.match(/^#\s+(.+)$/m);
  if (titleMatch) title = titleMatch[1]?.trim();

  let description: string | undefined;
  const lines = remaining.split('\n');
  let inDesc = false;
  const descLines: string[] = [];
  let seenTitle = false;
  for (const line of lines) {
    if (!seenTitle && line.startsWith('# ')) {
      seenTitle = true;
      inDesc = true;
      continue;
    }
    if (inDesc) {
      if (line.startsWith('> ')) {
        const c = line.slice(2).trim();
        if (c.startsWith('version:') || c.startsWith('created:') || c.startsWith('root:')) continue;
        descLines.push(c);
      } else if (line.trim() === '' && descLines.length === 0) {
      } else if (
        line.trim() === '' ||
        line.startsWith('## ') ||
        line.startsWith('^^^') ||
        line.startsWith('<flow-spec')
      ) {
        break;
      }
    }
  }
  if (descLines.length > 0) description = descLines.join('\n');

  const bodyMarkdown = extractBodyMarkdown(md);

  if (hasBlocks) {
    const { nodes, edges } = parseBlocks(md);
    // If blocks parsed but empty and there's XML, fallback to legacy parse for compat
    if (nodes.length === 0 && edges.length === 0 && md.includes('<flow-spec')) {
      const legacy = parseLegacyXml(md);
      if (legacy) {
        const lockForLegacy: FlowSpecLock = lock.locked
          ? lock
          : { locked: false, version: lock.version ?? '1.0.0' };
        const withLock = { ...legacy, lock: lockForLegacy, bodyMarkdown } as ParsedFlowSpec;
        return withLock;
      }
      return null;
    }
    // Use frontmatter version/rootId if present, else fallback to parsed title / defaults
    const version = lock.version ?? '1.0.0';
    // Avoid mutating the original lock object returned by parseFrontmatter
    const inferred = nodes.find((n) => n.kind === 'root')?.id ?? nodes[0]?.id ?? '';
    const candidateRoot = lock.rootId ?? inferred ?? '';
    if (!candidateRoot) return null;

    const candidate = {
      version,
      title: title || lock.title || 'Untitled',
      ...(description ? { description } : {}),
      rootId: candidateRoot,
      nodes,
      edges,
      ...(lock.createdAt ? { createdAt: lock.createdAt } : {}),
      ...(lock.updatedAt ? { updatedAt: lock.updatedAt } : {}),
    };
    const parsed = flowSpecSchema.safeParse(candidate);
    if (!parsed.success) return null;
    const normalizedLock: FlowSpecLock = {
      ...lock,
      title: parsed.data.title,
      version: parsed.data.version,
      rootId: parsed.data.rootId,
    };
    const result = { ...parsed.data, lock: normalizedLock, bodyMarkdown } as ParsedFlowSpec;
    return result;
  }

  // No blocks: try legacy XML
  const legacy = parseLegacyXml(md);
  if (legacy) {
    const lockForLegacy: FlowSpecLock = lock.locked
      ? lock
      : { locked: false, version: lock.version ?? '1.0.0' };
    const withLock = { ...legacy, lock: lockForLegacy, bodyMarkdown } as ParsedFlowSpec;
    return withLock;
  }

  // If no XML and no blocks but has frontmatter + maybe title? Ensure we handle case where file is new format but has no blocks yet? But spec requires at least one node -> invalid => return null
  // Also handle case where file has no frontmatter, no blocks, no XML => not a flowspec
  return null;
}

// Convenience: detect format — anchored to avoid false positive inside fenced code block
const BLOCK_DETECT_RE = /(?:^|\n)\^\^\^block(?:\s|$)/;
const ONE_LINE_DETECT_RE = /(?:^|\n)\^\^\^(?:block-)?(?:node|edge):/;
export function isMarkdownFlowSpec(content: string): boolean {
  return (
    BLOCK_DETECT_RE.test(content) ||
    ONE_LINE_DETECT_RE.test(content) ||
    (content.includes('<flow-spec') && content.includes('</flow-spec>'))
  );
}
