import * as path from 'node:path';
import { atomicWrite, deriveId, readRegistryFile, tryParseSpec, walkFiles } from './helpers.js';
import { ensureRegistryDir, fullPath, previewPath, workspacePath } from './paths.js';
import { nowIso, type Registry } from './types.js';

export interface SyncOptions {
  flowspecDir?: string;
  kind?: 'workspace' | 'preview' | 'full' | 'mark';
  prune?: boolean;
}

export function syncFromFilesystem(root?: string, opts: SyncOptions = {}): Registry {
  const flowspecDir =
    opts.flowspecDir ?? path.join(root ? path.resolve(root) : process.cwd(), 'flowspec');
  const rawKind = opts.kind ?? 'full';
  const kind = rawKind === 'mark' ? 'workspace' : (rawKind as 'workspace' | 'preview' | 'full');
  const prune = opts.prune ?? true;
  ensureRegistryDir(root);
  const file = kind === 'workspace' ? workspacePath(root) : kind === 'preview' ? previewPath(root) : fullPath(root);
  const reg = readRegistryFile(file);
  const files: string[] = [];
  walkFiles(path.resolve(flowspecDir), files);
  files.sort();
  const seenIds = new Set<string>();
  const repoRoot = root ? path.resolve(root) : process.cwd();
  let dirty = false;
  for (const absFile of files) {
    const parsed = tryParseSpec(absFile);
    if (!parsed) continue;
    const id = deriveId(flowspecDir, absFile);
    if (seenIds.has(id)) {
      if (absFile.endsWith('.json')) {
        console.warn(
          `[flow-spec] syncFromFilesystem: skipping .json duplicate for id "${id}" (${absFile}) — .md already registered`
        );
        continue;
      }
    }
    seenIds.add(id);
    const relPath = path.relative(repoRoot, absFile).split(path.sep).join('/');
    const existing = reg.entries[id];
    const now = nowIso();
    if (existing) {
      const needsUpdate =
        existing.title !== parsed.title ||
        existing.rootId !== parsed.rootId ||
        existing.path !== relPath;
      if (needsUpdate) {
        reg.entries[id] = {
          ...existing,
          title: parsed.title,
          rootId: parsed.rootId,
          path: relPath,
          updatedAt: now,
        };
        dirty = true;
      }
    } else {
      reg.entries[id] = {
        path: relPath,
        title: parsed.title,
        rootId: parsed.rootId,
        addedAt: now,
        updatedAt: now,
      };
      dirty = true;
    }
  }
  if (prune) {
    for (const id of Object.keys(reg.entries)) {
      if (!seenIds.has(id)) {
        delete reg.entries[id];
        dirty = true;
      }
    }
  }
  if (dirty) reg.updatedAt = nowIso();
  else reg.updatedAt = reg.updatedAt ?? nowIso();
  reg.version = reg.version ?? '1.0.0';
  atomicWrite(file, reg);
  return reg;
}
