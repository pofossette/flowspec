import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecSchema } from '@flowspec/domain';
import { atomicWriteFileSync } from '@flowspec/lock';
import { isMarkdownFlowSpec, parseFlowSpecFromMarkdown } from '@flowspec/parser';
import { createEmptyRegistry, nowIso, type Registry, registrySchema } from './types.js';

export function readRegistryFile(filePath: string): Registry {
  if (!fs.existsSync(filePath)) return createEmptyRegistry();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return createEmptyRegistry();
    const parsed = JSON.parse(raw);
    const result = registrySchema.safeParse(parsed);
    if (!result.success) return createEmptyRegistry();
    const data = result.data;
    if (!data.entries) data.entries = {};
    if (!data.updatedAt) data.updatedAt = nowIso();
    if (!data.version) data.version = '1.0.0';
    return data;
  } catch {
    return createEmptyRegistry();
  }
}

export function atomicWrite(filePath: string, data: Registry): void {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  atomicWriteFileSync(filePath, content);
}

const writeQueues = new Map<string, Promise<void>>();

export function enqueueWriteAsync(filePath: string, fn: () => Promise<void> | void): Promise<void> {
  const prev = writeQueues.get(filePath) ?? Promise.resolve();
  const next = prev.then(() => fn());
  const guarded = next.catch(() => {});
  writeQueues.set(filePath, guarded);
  return next;
}

export function walkFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else if (ent.isFile() && (full.endsWith('.md') || full.endsWith('.json'))) out.push(full);
  }
}

export function deriveId(flowspecDir: string, filePath: string): string {
  const rel = path.relative(path.resolve(flowspecDir), path.resolve(filePath));
  const withoutExt = rel.replace(/\.(md|json)$/, '');
  return withoutExt.split(path.sep).join('/');
}

export function tryParseSpec(filePath: string): { title: string; rootId: string } | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (filePath.endsWith('.md')) {
      if (raw.trim() === '') return null;
      const parsed = parseFlowSpecFromMarkdown(raw);
      if (!parsed) {
        if (isMarkdownFlowSpec(raw)) return null;
        return null;
      }
      return { title: parsed.title, rootId: parsed.rootId };
    } else {
      const json = JSON.parse(raw);
      const result = flowSpecSchema.safeParse(json);
      if (!result.success) return null;
      return { title: result.data.title, rootId: result.data.rootId };
    }
  } catch {
    return null;
  }
}
