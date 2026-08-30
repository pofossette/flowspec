import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecSchema, parseFlowSpecFromMarkdown } from '@flowspec/domain';
import { resolveSpecPath } from '@flowspec/lock';
import { ensureRegistryDir, loadMark, loadPreview } from '@flowspec/registry';
import type { Command } from 'commander';
import { toRepoRelative } from './shared.js';

export interface CheckFlowOptions {
  all?: boolean | undefined;
  root?: string | undefined;
}

export interface CheckResult {
  ok: boolean;
  idOrPath: string;
  errors: string[];
}

function validateSpecContent(raw: string, fileLabel: string): string[] {
  const parsed = parseFlowSpecFromMarkdown(raw);
  if (!parsed)
    return [`${fileLabel}: parseFlowSpecFromMarkdown failed (not a valid FlowSpec markdown)`];
  const result = flowSpecSchema.safeParse(parsed);
  if (!result.success)
    return result.error.issues.map((i) => `${fileLabel}: ${i.path.join('.')}: ${i.message}`);
  return [];
}

export function handleCheckFlowSpec(
  target: string | undefined,
  opts: CheckFlowOptions = {}
): CheckResult[] {
  const root = opts.root ? path.resolve(opts.root) : process.cwd();
  ensureRegistryDir(root);
  if (opts.all) {
    const reg = loadMark(root);
    const ids = Object.keys(reg.entries);
    if (ids.length === 0) return [];
    const results: CheckResult[] = [];
    for (const id of ids) {
      const entry = reg.entries[id];
      if (!entry) continue;
      const abs = path.resolve(root, entry.path);
      if (!fs.existsSync(abs)) {
        results.push({ ok: false, idOrPath: id, errors: [`${entry.path}: file not found`] });
        continue;
      }
      const raw = fs.readFileSync(abs, 'utf-8');
      const errors = validateSpecContent(raw, entry.path);
      results.push({ ok: errors.length === 0, idOrPath: id, errors });
    }
    return results;
  }
  if (!target) throw new Error('Missing id|path argument (or use --all)');
  let abs: string | null = null;
  let label = target;
  const looksLikePath =
    target.includes('/') ||
    target.includes('\\') ||
    target.endsWith('.md') ||
    target.endsWith('.json');
  if (looksLikePath) {
    abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
    label = toRepoRelative(abs, root);
  } else {
    const mark = loadMark(root);
    const preview = loadPreview(root);
    const entry = mark.entries[target] ?? preview.entries[target];
    if (entry) {
      abs = path.resolve(root, entry.path);
      label = target;
    } else {
      const candidate = resolveSpecPath(target, path.join(root, 'flowspec'));
      if (fs.existsSync(candidate)) {
        abs = candidate;
        label = target;
      } else {
        const direct = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
        if (fs.existsSync(direct)) {
          abs = direct;
          label = toRepoRelative(direct, root);
        }
      }
    }
  }
  if (!abs || !fs.existsSync(abs))
    return [{ ok: false, idOrPath: label, errors: [`${label}: file not found`] }];
  const raw = fs.readFileSync(abs, 'utf-8');
  const errors = validateSpecContent(raw, label);
  return [{ ok: errors.length === 0, idOrPath: label, errors }];
}

export function registerCheckCommand(flow: Command): void {
  flow
    .command('check')
    .description(
      'Validate FlowSpec structure (zod + rootId + edges refs); use --all to check all registered'
    )
    .argument('[target]', 'id or path to check (omit with --all)')
    .option('--all', 'Check all entries in mark.json', false)
    .action((target: string | undefined, opts: { all?: boolean }) => {
      try {
        const results = handleCheckFlowSpec(target, { all: opts.all });
        if (results.length === 0) {
          console.log(JSON.stringify({ ok: true, checked: 0, message: 'no entries' }, null, 2));
          return;
        }
        let hasError = false;
        for (const r of results) {
          if (r.ok) console.log(`${r.idOrPath}: ok`);
          else {
            hasError = true;
            for (const err of r.errors) console.error(err);
            console.error(`${r.idOrPath}: FAILED`);
          }
        }
        if (hasError) process.exitCode = 1;
        else console.log(JSON.stringify({ ok: true, checked: results.length }, null, 2));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exitCode = 1;
      }
    });
}
