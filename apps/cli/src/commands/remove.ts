import * as fs from 'node:fs';
import * as path from 'node:path';
import { readLockFromMarkdown, writeLockToMarkdown } from '@flowspec/lock';
import { stripBlocks } from '@flowspec/parser';
import {
  ensureRegistryDir,
  findRepoRoot,
  loadFull,
  loadPreview,
  loadWorkspace,
  removeEntry,
} from '@flowspec/registry';
import type { Command } from 'commander';

export interface RemoveFlowOptions {
  deleteBlocks?: boolean | undefined;
  root?: string | undefined;
}

export function handleRemoveFlowSpec(
  id: string,
  opts: RemoveFlowOptions = {}
): {
  removedWorkspace: boolean;
  removedMark: boolean;
  removedPreview: boolean;
  removedFull: boolean;
} {
  const root = opts.root ? path.resolve(opts.root) : findRepoRoot(process.cwd());
  ensureRegistryDir(root);
  if (!id?.trim()) throw new Error('Missing <id> for remove');
  const cleanId = id.trim();
  const workspaceBefore = loadWorkspace(root);
  const previewBefore = loadPreview(root);
  const fullBefore = loadFull(root);
  const entry =
    workspaceBefore.entries[cleanId] ??
    previewBefore.entries[cleanId] ??
    fullBefore.entries[cleanId] ??
    null;
  const filePathForBlocks = entry ? path.resolve(root, entry.path) : null;
  const removedWorkspace = removeEntry('workspace', cleanId, root);
  const removedPreview = removeEntry('preview', cleanId, root);
  // 按新要求：remove 同时清理 full 中的链接
  const removedFull = removeEntry('full', cleanId, root);
  if (!removedWorkspace && !removedPreview && !removedFull)
    throw new Error(`id not found in registry: ${cleanId}`);
  // 兼容返回字段：同时提供 removedMark 别名
  const _anyRemoved = removedWorkspace || removedPreview || removedFull;
  if (opts.deleteBlocks && filePathForBlocks && fs.existsSync(filePathForBlocks)) {
    const raw = fs.readFileSync(filePathForBlocks, 'utf-8');
    const origLock = readLockFromMarkdown(raw);
    const stripped = stripBlocks(raw);
    const lockPatch: {
      locked: boolean;
      holder?: string;
      note?: string;
      lockReason?: string;
      acquiredAt?: string;
      expiresAt?: string;
      version?: string;
      rootId?: string;
      title?: string;
      createdAt?: string;
      updatedAt?: string;
    } = { locked: false, holder: '', note: '', lockReason: '', acquiredAt: '', expiresAt: '' };
    if (origLock) {
      if (origLock.version) lockPatch.version = origLock.version;
      if (origLock.rootId) lockPatch.rootId = origLock.rootId;
      if (origLock.title) lockPatch.title = origLock.title;
      if (origLock.createdAt) lockPatch.createdAt = origLock.createdAt;
      if (origLock.updatedAt) lockPatch.updatedAt = origLock.updatedAt;
    }
    const nextContent = writeLockToMarkdown(stripped, lockPatch);
    fs.writeFileSync(filePathForBlocks, nextContent, 'utf-8');
  }
  // 兼容返回字段
  return {
    removedWorkspace,
    removedPreview,
    removedFull,
    removedMark: removedWorkspace,
  } as {
    removedWorkspace: boolean;
    removedPreview: boolean;
    removedFull: boolean;
    removedMark: boolean;
  };
}

export function registerRemoveCommand(flow: Command): void {
  flow
    .command('remove')
    .description('Remove entry from registry (does not delete file unless --delete-blocks)')
    .argument('<id>', 'Registry id to remove')
    .option(
      '--delete-blocks',
      'Also strip ^^^block blocks from markdown and set frontmatter locked:false',
      false
    )
    .action((id: string, opts: { deleteBlocks?: boolean }) => {
      try {
        const res = handleRemoveFlowSpec(id, { deleteBlocks: opts.deleteBlocks }) as unknown as {
          removedWorkspace: boolean;
          removedPreview: boolean;
          removedFull: boolean;
          removedMark?: boolean;
        };
        console.log(
          JSON.stringify(
            {
              ok: true,
              id,
              removedWorkspace: res.removedWorkspace ?? res.removedMark,
              removedMark: res.removedWorkspace ?? res.removedMark,
              removedPreview: res.removedPreview,
              removedFull: res.removedFull,
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
