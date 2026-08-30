import * as fs from 'node:fs';
import * as path from 'node:path';
import { stripBlocks } from '@flowspec/domain';
import { readLockFromMarkdown, writeLockToMarkdown } from '@flowspec/lock';
import { ensureRegistryDir, loadMark, loadPreview, removeEntry } from '@flowspec/registry';
import type { Command } from 'commander';

export interface RemoveFlowOptions {
  deleteBlocks?: boolean | undefined;
  root?: string | undefined;
}

export function handleRemoveFlowSpec(
  id: string,
  opts: RemoveFlowOptions = {}
): { removedMark: boolean; removedPreview: boolean } {
  const root = opts.root ? path.resolve(opts.root) : process.cwd();
  ensureRegistryDir(root);
  if (!id?.trim()) throw new Error('Missing <id> for remove');
  const cleanId = id.trim();
  const markBefore = loadMark(root);
  const previewBefore = loadPreview(root);
  const entry = markBefore.entries[cleanId] ?? previewBefore.entries[cleanId] ?? null;
  const filePathForBlocks = entry ? path.resolve(root, entry.path) : null;
  const removedMark = removeEntry('mark', cleanId, root);
  const removedPreview = removeEntry('preview', cleanId, root);
  if (!removedMark && !removedPreview) throw new Error(`id not found in registry: ${cleanId}`);
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
  return { removedMark, removedPreview };
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
        const res = handleRemoveFlowSpec(id, { deleteBlocks: opts.deleteBlocks });
        console.log(
          JSON.stringify(
            { ok: true, id, removedMark: res.removedMark, removedPreview: res.removedPreview },
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
