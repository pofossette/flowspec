import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecSchema } from '@flowspec/domain';
import { resolveSpecPath } from '@flowspec/lock';
import {
  extractBodyMarkdown,
  isMarkdownFlowSpec,
  parseBlocks,
  parseFlowSpecFromMarkdown,
} from '@flowspec/parser';
import { ensureRegistryDir, findRepoRoot, loadPreview, loadWorkspace } from '@flowspec/registry';
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
  warnings: string[];
  info: string[];
}

function validateBlocksSyntax(raw: string, fileLabel: string): string[] {
  const errors: string[] = [];
  const lines = raw.split('\n');
  let inBlock = false;
  let blockStart = -1;
  let blockHeader = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    const isStart =
      trimmed.startsWith('^^^block') || /^\^\^\^(?:block-)?(?:node|edge):/.test(trimmed);
    const isEnd = trimmed === '^^^';
    if (!inBlock && isStart) {
      inBlock = true;
      blockStart = i + 1;
      blockHeader = trimmed;
      // one-line header must be metadata:id:type:x:y:targetid[:label[:status]]
      if (/^\^\^\^(?:block-)?(?:node|edge):/.test(trimmed)) {
        const m = trimmed.match(/^\^\^\^(?:block-)?(node|edge):(.*)$/);
        const header = m?.[2] ?? '';
        const parts = header.split(':');
        if (parts.length < 6) {
          errors.push(
            `${fileLabel}:${blockStart}: invalid one-line key "${header}" need 6 parts metadata:id:type:x:y:targetid`
          );
        } else {
          const [metadata, id, kind, xRaw, yRaw, targetid] = parts;
          if (!metadata || !id || !kind) {
            errors.push(`${fileLabel}:${blockStart}: key missing metadata/id/type`);
          }
          const validNodeKinds = [
            'root',
            'branch',
            'leaf',
            'task',
            'decision',
            'note',
            'goal',
            'milestone',
            'risk',
            'insight',
            'question',
          ];
          const validEdgeKinds = [
            'hierarchical',
            'dependency',
            'reference',
            'causal',
            'sequence',
            'async',
            'feedback',
            'blocked',
          ];
          const allKinds = [...validNodeKinds, ...validEdgeKinds];
          if (!allKinds.includes(kind!)) {
            errors.push(`${fileLabel}:${blockStart}: unknown kind "${kind}"`);
          }
          if (xRaw !== 'null' && xRaw !== '' && Number.isNaN(Number(xRaw))) {
            errors.push(`${fileLabel}:${blockStart}: invalid x "${xRaw}"`);
          }
          if (yRaw !== 'null' && yRaw !== '' && Number.isNaN(Number(yRaw))) {
            errors.push(`${fileLabel}:${blockStart}: invalid y "${yRaw}"`);
          }
          // edge should have target, node target should be null
          const isNode = trimmed.startsWith('^^^node') || trimmed.includes(':null:');
          if (isNode && targetid !== 'null' && targetid !== 'undefined' && targetid !== '') {
            // node target should be null, but allow non-null for backwards compat
          }
        }
      } else if (trimmed === '^^^block') {
        // legacy ^^^block will be validated by yaml parsing later
      }
      continue;
    }
    if (inBlock && isEnd) {
      inBlock = false;
      blockStart = -1;
      blockHeader = '';
    }
  }
  if (inBlock) {
    errors.push(`${fileLabel}:${blockStart}: unclosed block "${blockHeader}" missing closing ^^^`);
  }
  return errors;
}

function validateHeader(raw: string, fileLabel: string): string[] {
  const errors: string[] = [];
  const fmMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!fmMatch) {
    errors.push(`${fileLabel}: missing frontmatter --- title/rootId ---`);
    return errors;
  }
  const yamlText = fmMatch[1] ?? '';
  if (!yamlText.includes('title:')) errors.push(`${fileLabel}: frontmatter missing title`);
  if (!yamlText.includes('rootId:')) errors.push(`${fileLabel}: frontmatter missing rootId`);
  // markdown title
  const withoutFm = raw.slice(fmMatch[0].length);
  if (!withoutFm.match(/^#\s+.+/m)) {
    errors.push(`${fileLabel}: missing markdown title "# ..."`);
  }
  return errors;
}

function validateSpecContent(
  raw: string,
  fileLabel: string
): { errors: string[]; warnings: string[]; info: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // 1) block syntax
  errors.push(...validateBlocksSyntax(raw, fileLabel));
  // 2) header
  errors.push(...validateHeader(raw, fileLabel));

  // 3) parser + schema
  if (!isMarkdownFlowSpec(raw)) {
    errors.push(
      `${fileLabel}: not a flowspec markdown (no ^^^node/^ ^edge/^ ^block or <flow-spec>)`
    );
    return { errors, warnings, info };
  }
  const parsed = parseFlowSpecFromMarkdown(raw);
  if (!parsed) {
    errors.push(`${fileLabel}: parseFlowSpecFromMarkdown failed`);
    return { errors, warnings, info };
  }
  // duplicate ids
  const seen = new Set<string>();
  for (const n of parsed.nodes) {
    if (seen.has(n.id)) errors.push(`${fileLabel}: duplicate node id "${n.id}"`);
    seen.add(n.id);
  }
  for (const e of parsed.edges) {
    if (seen.has(e.id)) warnings.push(`${fileLabel}: duplicate edge id "${e.id}"`);
    seen.add(e.id);
  }
  const result = flowSpecSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${fileLabel}: ${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // 4) unwrapped content info (not rendered)
  const body = extractBodyMarkdown(raw);
  if (body.trim()) {
    info.push(
      `${fileLabel}: body has ${body.split('\n').length} lines of unwrapped markdown (not rendered in canvas, only blocks are)`
    );
  }
  // also detect blocks without content
  const { nodes, edges } = parseBlocks(raw);
  for (const n of nodes) if (!n.content) info.push(`${fileLabel}: node ${n.id} has no content`);
  for (const e of edges)
    if (!e.content && !e.label) info.push(`${fileLabel}: edge ${e.id} has no label/content`);

  return { errors, warnings, info };
}

function resolveRepoRoot(start: string): string {
  try {
    return findRepoRoot(start);
  } catch {
    return start;
  }
}
function tryResolveFile(target: string, roots: string[]): string | null {
  for (const r of roots) {
    const abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(r, target);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

export function handleCheckFlowSpec(
  target: string | undefined,
  opts: CheckFlowOptions = {}
): CheckResult[] {
  const cwd = process.cwd();
  const repoRoot = resolveRepoRoot(cwd);
  const root = opts.root ? path.resolve(opts.root) : repoRoot;
  try {
    ensureRegistryDir(root);
  } catch {
    // ignore if cannot ensure (e.g. in temp test dir)
  }
  if (opts.all) {
    const reg = loadWorkspace(root);
    const ids = Object.keys(reg.entries);
    if (ids.length === 0) return [];
    const results: CheckResult[] = [];
    for (const id of ids) {
      const entry = reg.entries[id];
      if (!entry) continue;
      const abs = path.resolve(root, entry.path);
      if (!fs.existsSync(abs)) {
        results.push({
          ok: false,
          idOrPath: id,
          errors: [`${entry.path}: file not found`],
          warnings: [],
          info: [],
        });
        continue;
      }
      const raw = fs.readFileSync(abs, 'utf-8');
      const { errors, warnings, info } = validateSpecContent(raw, entry.path);
      results.push({ ok: errors.length === 0, idOrPath: id, errors, warnings, info });
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
  const candidateRoots = [cwd, repoRoot, root].filter((v, i, a) => a.indexOf(v) === i);
  if (looksLikePath) {
    abs =
      tryResolveFile(target, candidateRoots) ??
      tryResolveFile(target, [path.join(repoRoot, 'flowspec')]);
    if (abs) label = toRepoRelative(abs, repoRoot);
  } else {
    const workspace = loadWorkspace(root);
    const preview = loadPreview(root);
    const entry = workspace.entries[target] ?? preview.entries[target];
    if (entry) {
      abs = path.resolve(repoRoot, entry.path);
      label = target;
    } else {
      // try as id -> flowspec/<id>.md in repoRoot and cwd
      for (const r of candidateRoots) {
        const cand = resolveSpecPath(target, path.join(r, 'flowspec'));
        if (fs.existsSync(cand)) {
          abs = cand;
          label = target;
          break;
        }
      }
      if (!abs) {
        abs = tryResolveFile(target, candidateRoots);
        if (abs) label = toRepoRelative(abs, repoRoot);
      }
    }
  }
  if (!abs || !fs.existsSync(abs))
    return [
      { ok: false, idOrPath: label, errors: [`${label}: file not found`], warnings: [], info: [] },
    ];
  const raw = fs.readFileSync(abs, 'utf-8');
  const { errors, warnings, info } = validateSpecContent(raw, label);
  return [{ ok: errors.length === 0, idOrPath: label, errors, warnings, info }];
}

export function registerCheckCommand(flow: Command): void {
  flow
    .command('check')
    .description(
      'Check syntax: block划分 (^^^node/^ ^edge 一行式 metadata:id:type:x:y:targetid) + 头部 title/rootId + 图结构；未被 ^^^ 包裹的内容默认不渲染'
    )
    .argument('[target]', 'id or path to check (omit with --all)')
    .option('--all', 'Check all entries in workspace.json', false)
    .option('--verbose', 'Show warnings and info', false)
    .action((target: string | undefined, opts: { all?: boolean; verbose?: boolean }) => {
      try {
        const results = handleCheckFlowSpec(target, { all: opts.all });
        if (results.length === 0) {
          console.log(JSON.stringify({ ok: true, checked: 0, message: 'no entries' }, null, 2));
          return;
        }
        let hasError = false;
        for (const r of results) {
          if (r.ok) {
            console.log(`${r.idOrPath}: ok`);
            if (opts.verbose) {
              for (const w of r.warnings) console.warn(`  warn: ${w}`);
              for (const inf of r.info) console.log(`  info: ${inf}`);
            }
          } else {
            hasError = true;
            for (const err of r.errors) console.error(err);
            for (const w of r.warnings) console.warn(`  warn: ${w}`);
            for (const inf of r.info) console.log(`  info: ${inf}`);
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
