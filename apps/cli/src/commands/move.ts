import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecSchema } from '@flowspec/domain';
import { parseFlowSpecFromMarkdown } from '@flowspec/parser';
import {
  addEntry,
  ensureRegistryDir,
  findRepoRoot,
  loadFull,
  loadPreview,
  loadWorkspace,
  removeEntry,
} from '@flowspec/registry';
import type { Command } from 'commander';
import { deriveIdFromPath, toRepoRelative } from './shared.js';

export interface MoveFlowOptions {
  root?: string | undefined;
}

export function handleMoveFlowSpec(
  src: string,
  dest: string,
  opts: MoveFlowOptions = {}
): { srcId: string; destId: string; srcPath: string; destPath: string } {
  const root = opts.root ? path.resolve(opts.root) : findRepoRoot(process.cwd());
  ensureRegistryDir(root);
  if (!src || !dest) throw new Error('Missing <src> <dest> for move');
  const srcAbs = path.isAbsolute(src) ? path.resolve(src) : path.resolve(root, src);
  const destAbs = path.isAbsolute(dest) ? path.resolve(dest) : path.resolve(root, dest);
  if (!fs.existsSync(srcAbs)) throw new Error(`Source not found: ${src}`);
  if (fs.existsSync(destAbs)) throw new Error(`Destination already exists: ${dest}`);
  const relSrc = toRepoRelative(srcAbs, root);
  const relDest = toRepoRelative(destAbs, root);
  const destId = deriveIdFromPath(dest);
  const workspace = loadWorkspace(root);
  const preview = loadPreview(root);
  const full = loadFull(root);
  let srcId: string | null = null;
  for (const [k, v] of Object.entries(workspace.entries))
    if (v.path === relSrc) {
      srcId = k;
      break;
    }
  if (!srcId)
    for (const [k, v] of Object.entries(preview.entries))
      if (v.path === relSrc) {
        srcId = k;
        break;
      }
  if (!srcId)
    for (const [k, v] of Object.entries(full.entries))
      if (v.path === relSrc) {
        srcId = k;
        break;
      }
  if (!srcId) {
    const candidate = deriveIdFromPath(src);
    if (candidate in workspace.entries || candidate in preview.entries || candidate in full.entries)
      srcId = candidate;
    else if (src in workspace.entries || src in preview.entries || src in full.entries) srcId = src;
  }
  if (destId in workspace.entries || destId in preview.entries || destId in full.entries)
    throw new Error(`Destination id already exists in registry: ${destId}`);
  const rawSrc = fs.readFileSync(srcAbs, 'utf-8');
  const preParsed = parseFlowSpecFromMarkdown(rawSrc);
  if (!preParsed) throw new Error(`Source file is not a valid FlowSpec: ${src}`);
  const preValidated = flowSpecSchema.safeParse(preParsed);
  if (!preValidated.success) {
    const issues = preValidated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Source file validation failed: ${issues}`);
  }
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.renameSync(srcAbs, destAbs);
  let validated: ReturnType<typeof flowSpecSchema.safeParse>;
  try {
    const rawDest = fs.readFileSync(destAbs, 'utf-8');
    const parsed = parseFlowSpecFromMarkdown(rawDest);
    if (!parsed) throw new Error(`Moved file is not a valid FlowSpec: ${dest}`);
    validated = flowSpecSchema.safeParse(parsed);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Moved file validation failed: ${issues}`);
    }
  } catch (e) {
    try {
      if (fs.existsSync(destAbs) && !fs.existsSync(srcAbs)) {
        fs.mkdirSync(path.dirname(srcAbs), { recursive: true });
        fs.renameSync(destAbs, srcAbs);
      }
    } catch {}
    throw e;
  }
  if (srcId) {
    const now = new Date().toISOString();
    if (srcId in workspace.entries) {
      const old = workspace.entries[srcId];
      if (old) {
        removeEntry('workspace', srcId, root);
        addEntry(
          'workspace',
          destId,
          {
            path: relDest,
            title: old.title,
            rootId: old.rootId,
            addedAt: old.addedAt,
            updatedAt: now,
          },
          root
        );
      }
    }
    if (srcId in preview.entries) {
      const old = preview.entries[srcId];
      if (old) {
        removeEntry('preview', srcId, root);
        addEntry(
          'preview',
          destId,
          {
            path: relDest,
            title: old.title,
            rootId: old.rootId,
            addedAt: old.addedAt,
            updatedAt: now,
          },
          root
        );
      }
    }
    if (srcId in full.entries) {
      const old = full.entries[srcId];
      if (old) {
        removeEntry('full', srcId, root);
        addEntry(
          'full',
          destId,
          {
            path: relDest,
            title: old.title,
            rootId: old.rootId,
            addedAt: old.addedAt,
            updatedAt: now,
          },
          root
        );
      }
    } else {
      // src not tracked but file moved: ensure full has new entry
      try {
        const title = (validated as Extract<typeof validated, { success: true }>).data.title;
        const rootId = (validated as Extract<typeof validated, { success: true }>).data.rootId;
        addEntry('full', destId, { path: relDest, title, rootId, addedAt: now, updatedAt: now }, root);
      } catch {}
    }
  } else {
    const now = new Date().toISOString();
    const title = (validated as Extract<typeof validated, { success: true }>).data.title;
    const rootId = (validated as Extract<typeof validated, { success: true }>).data.rootId;
    addEntry('workspace', destId, { path: relDest, title, rootId, addedAt: now, updatedAt: now }, root);
    try {
      addEntry('full', destId, { path: relDest, title, rootId, addedAt: now, updatedAt: now }, root);
    } catch {}
  }
  return { srcId: srcId ?? deriveIdFromPath(src), destId, srcPath: relSrc, destPath: relDest };
}

export function registerMoveCommand(flow: Command): void {
  flow
    .command('move')
    .description('Move/rename a FlowSpec file and update registry entries (workspace/preview/full)')
    .argument('<src>', 'Source path')
    .argument('<dest>', 'Destination path')
    .action((src: string, dest: string) => {
      try {
        const res = handleMoveFlowSpec(src, dest);
        console.log(
          JSON.stringify(
            {
              ok: true,
              srcId: res.srcId,
              destId: res.destId,
              srcPath: res.srcPath,
              destPath: res.destPath,
            },
            null,
            2
          )
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exitCode = 1;
      }
    });
}
