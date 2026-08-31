import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecSchema } from '@flowspec/domain';
import { parseFlowSpecFromMarkdown } from '@flowspec/parser';
import {
  addEntry,
  ensureRegistryDir,
  findRepoRoot,
  loadPreview,
  loadWorkspace,
} from '@flowspec/registry';
import type { Command } from 'commander';
import { deriveIdFromPath, toRepoRelative } from './shared.js';

export interface AddFlowOptions {
  id?: string | undefined;
  preview?: boolean | undefined;
  root?: string | undefined;
}

export function handleAddFlowSpec(
  filePath: string,
  opts: AddFlowOptions = {}
): { id: string; relPath: string } {
  const root = opts.root ? path.resolve(opts.root) : findRepoRoot(process.cwd());
  ensureRegistryDir(root);
  const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${filePath}`);
  const raw = fs.readFileSync(abs, 'utf-8');
  const parsed = parseFlowSpecFromMarkdown(raw);
  if (!parsed) throw new Error(`Invalid FlowSpec: parse failed for ${filePath}`);
  const validated = flowSpecSchema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid FlowSpec: ${issues}`);
  }
  const id = deriveIdFromPath(filePath, opts.id);
  if (!id) throw new Error('Derived id is empty');
  if (id in loadWorkspace(root).entries || id in loadPreview(root).entries) {
    throw new Error(`id already registered: ${id}`);
  }
  const relPath = toRepoRelative(abs, root);
  if (!relPath.startsWith('flowspec/')) {
    console.warn(`[warn] file not under flowspec/: ${relPath} — still registering`);
  }
  const now = new Date().toISOString();
  const entry = {
    path: relPath,
    title: validated.data.title,
    rootId: validated.data.rootId,
    addedAt: now,
    updatedAt: now,
  };
  addEntry('workspace', id, entry, root);
  if (opts.preview) addEntry('preview', id, entry, root);
  // 同步写入 full.json（全量），保证工作区与全量一致；addEntry 为 upsert，会更新已存在的 full 条目
  try {
    addEntry('full', id, entry, root);
  } catch {}
  return { id, relPath };
}

export function registerAddCommand(flow: Command): void {
  flow
    .command('add')
    .description(
      'Register a FlowSpec markdown file into workspace.json + full.json (.flowspec registry, auto-creates .flowspec)'
    )
    .argument('<path>', 'Path to markdown file (any location, must contain ^^^block syntax)')
    .option('--id <id>', 'Override registry id (default: basename without extension)')
    .option('--preview', 'Also register into preview.json', false)
    .action((filePath: string, opts: { id?: string; preview?: boolean }) => {
      try {
        const result = handleAddFlowSpec(filePath, { id: opts.id, preview: opts.preview });
        console.log(
          JSON.stringify(
            { ok: true, id: result.id, path: result.relPath, preview: Boolean(opts.preview) },
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
