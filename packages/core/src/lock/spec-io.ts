import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  extractBodyMarkdown,
  isMarkdownFlowSpec,
  parseFlowSpecFromMarkdown,
  serializeFlowSpecToMarkdown,
  type FlowSpecLock,
} from '../domain/flow-spec-md.js';
import { flowSpecSchema } from '../domain/flow-spec.js';
import { atomicWriteFileSync } from './helpers.js';
import { readLockFromMarkdown } from './frontmatter.js';
import { resolveSpecPath } from './paths.js';

const DEFAULT_DIR = 'flowspec';

export function loadSpecRaw(id: string, flowspecDir = DEFAULT_DIR): unknown | null {
  const p = resolveSpecPath(id, flowspecDir);
  if (!fs.existsSync(p)) {
    const alt = p.endsWith('.md')
      ? p.slice(0, -3) + '.json'
      : p.endsWith('.json')
        ? p.slice(0, -5) + '.md'
        : null;
    if (alt && fs.existsSync(alt)) {
      try {
        const rawAlt = fs.readFileSync(alt, 'utf-8');
        if (isMarkdownFlowSpec(rawAlt)) {
          const parsed = parseFlowSpecFromMarkdown(rawAlt);
          if (parsed) return parsed;
        }
        try {
          return JSON.parse(rawAlt);
        } catch {
          if (!isMarkdownFlowSpec(rawAlt)) return null;
          return parseFlowSpecFromMarkdown(rawAlt);
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    if (isMarkdownFlowSpec(raw)) {
      const parsed = parseFlowSpecFromMarkdown(raw);
      if (parsed) return parsed;
    }
    try {
      return JSON.parse(raw);
    } catch {
      if (!isMarkdownFlowSpec(raw)) return null;
      return parseFlowSpecFromMarkdown(raw);
    }
  } catch {
    return null;
  }
}

export function saveSpecRaw(id: string, data: unknown, flowspecDir = DEFAULT_DIR): string {
  const p = resolveSpecPath(id, flowspecDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const maybeSpec = data as Record<string, unknown>;
  const looksLikeSpec =
    maybeSpec && typeof maybeSpec['rootId'] === 'string' && Array.isArray(maybeSpec['nodes']);
  if (looksLikeSpec && p.endsWith('.md')) {
    const parsed = flowSpecSchema.safeParse(data);
    if (parsed.success) {
      let existingBody: string | undefined;
      let existingLock: Partial<FlowSpecLock> | undefined;
      const dataAny = data as Record<string, unknown>;
      const overrideBody =
        typeof dataAny['bodyMarkdown'] === 'string'
          ? (dataAny['bodyMarkdown'] as string)
          : undefined;
      const overrideLock =
        dataAny['lock'] && typeof dataAny['lock'] === 'object' && !Array.isArray(dataAny['lock'])
          ? (dataAny['lock'] as Partial<FlowSpecLock>)
          : undefined;
      if (fs.existsSync(p)) {
        try {
          const rawExisting = fs.readFileSync(p, 'utf-8');
          const parsedExisting = parseFlowSpecFromMarkdown(rawExisting);
          if (parsedExisting) {
            existingBody = parsedExisting.bodyMarkdown;
            existingLock = parsedExisting.lock;
          } else if (!isMarkdownFlowSpec(rawExisting)) {
            existingBody = extractBodyMarkdown(rawExisting) || rawExisting.trim();
            const fm = readLockFromMarkdown(rawExisting);
            if (fm) existingLock = fm;
          } else {
            existingBody = extractBodyMarkdown(rawExisting);
            const fm = readLockFromMarkdown(rawExisting);
            if (fm) existingLock = fm;
          }
        } catch {}
      }
      const bodyMarkdown = overrideBody ?? existingBody;
      const lock = overrideLock ?? existingLock;
      const md = serializeFlowSpecToMarkdown(parsed.data, {
        ...(bodyMarkdown !== undefined ? { bodyMarkdown } : {}),
        ...(lock ? { lock } : {}),
      });
      atomicWriteFileSync(p, md);
      const alt = p.slice(0, -3) + '.json';
      if (fs.existsSync(alt)) {
        try {
          fs.unlinkSync(alt);
        } catch {}
      }
      return p;
    }
  }
  if (p.endsWith('.md') && looksLikeSpec) {
    const parsed = flowSpecSchema.safeParse(data);
    const msg = parsed.success ? 'unknown' : parsed.error.message;
    throw new Error(`invalid FlowSpec for "${id}": ${msg} — refusing to write JSON into .md`);
  }
  atomicWriteFileSync(p, JSON.stringify(data, null, 2) + '\n');
  return p;
}

export function readRawSpecContent(specPath: string): string | null {
  try {
    if (fs.existsSync(specPath)) return fs.readFileSync(specPath, 'utf-8');
    const alt = specPath.endsWith('.md')
      ? specPath.slice(0, -3) + '.json'
      : specPath.slice(0, -5) + '.md';
    if (alt && fs.existsSync(alt)) return fs.readFileSync(alt, 'utf-8');
  } catch {}
  return null;
}

export function getEmptySpecForPureMarkdown(
  rawContent: string,
  fallbackId: string,
): { spec: Record<string, unknown>; bodyMarkdown: string; frontmatter: FlowSpecLock | null } {
  const titleMatch = rawContent.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1]!.trim() : fallbackId;
  const fm = readLockFromMarkdown(rawContent);
  const bodyMarkdown = extractBodyMarkdown(rawContent) || rawContent.trim();
  const spec: Record<string, unknown> = {
    version: fm?.version ?? '1.0.0',
    title,
    rootId: fm?.rootId ?? 'root',
    nodes: [],
    edges: [],
    ...(fm?.createdAt ? { createdAt: fm.createdAt } : {}),
    ...(fm?.updatedAt ? { updatedAt: fm.updatedAt } : {}),
  };
  return { spec, bodyMarkdown, frontmatter: fm };
}

export function resolveSpecBodyAndFrontmatter(
  raw: unknown,
  rawContent: string | null,
): { bodyMarkdown: string; frontmatter: FlowSpecLock | null } {
  const rawRec = raw as Record<string, unknown>;
  const bodyMarkdown =
    (typeof rawRec['bodyMarkdown'] === 'string' ? (rawRec['bodyMarkdown'] as string) : undefined) ??
    (rawContent
      ? (parseFlowSpecFromMarkdown(rawContent)?.bodyMarkdown ?? extractBodyMarkdown(rawContent))
      : '');
  const maybeLock = rawRec['lock'];
  const frontmatter =
    maybeLock && typeof maybeLock === 'object' && !Array.isArray(maybeLock)
      ? (maybeLock as FlowSpecLock)
      : rawContent
        ? readLockFromMarkdown(rawContent)
        : null;
  return { bodyMarkdown: bodyMarkdown ?? '', frontmatter };
}

export function loadSpecMarkdown(id: string, flowspecDir = DEFAULT_DIR): string | null {
  const p = resolveSpecPath(id, flowspecDir);
  const candidates = [p, p.endsWith('.md') ? p.slice(0, -3) + '.json' : p.slice(0, -5) + '.md'];
  for (const c of candidates) {
    if (!c || !fs.existsSync(c)) continue;
    try {
      const raw = fs.readFileSync(c, 'utf-8');
      if (c.endsWith('.md')) return raw;
      const parsed = flowSpecSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return serializeFlowSpecToMarkdown(parsed.data);
      return raw;
    } catch {
      continue;
    }
  }
  return null;
}
