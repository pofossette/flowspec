import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { flowSpecExample } from '@flowspec/domain';
import { readLockFromMarkdown } from '@flowspec/lock';
import { parseFlowSpecFromMarkdown, serializeFlowSpecToMarkdown } from '@flowspec/parser';
import { loadMark, loadPreview } from '@flowspec/registry';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveIdFromPath,
  handleAddFlowSpec,
  handleCheckFlowSpec,
  handleMoveFlowSpec,
  handleRemoveFlowSpec,
  registerFlowSpecCommands,
  toRepoRelative,
} from './commands/index.js';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cli-test-'));
}

function mkValidMd(overrides: Partial<typeof flowSpecExample> = {}): string {
  const spec = { ...flowSpecExample, ...overrides };
  // ensure nodes/edges consistent
  return serializeFlowSpecToMarkdown(spec);
}

describe('flow cli helpers', () => {
  it('deriveIdFromPath', () => {
    expect(deriveIdFromPath('flowspec/demo.md')).toBe('demo');
    expect(deriveIdFromPath('/a/b/my-file.json')).toBe('my-file');
    expect(deriveIdFromPath('noext')).toBe('noext');
    expect(deriveIdFromPath('anything', 'custom')).toBe('custom');
    expect(deriveIdFromPath('anything', '  custom  ')).toBe('custom');
  });

  it('toRepoRelative', () => {
    const root = tmpRoot();
    const abs = path.join(root, 'flowspec/demo.md');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'x');
    expect(toRepoRelative(abs, root)).toBe('flowspec/demo.md');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('flow add', () => {
  let root: string;
  beforeEach(() => {
    root = tmpRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('add happy — auto-creates .flowspec and registers workspace', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd({ title: 'Demo MD', rootId: 'root-1' }), 'utf-8');
    expect(fs.existsSync(path.join(root, '.flowspec'))).toBe(false);
    const res = handleAddFlowSpec(file, { root });
    expect(res.id).toBe('demo');
    expect(res.relPath).toBe('flowspec/demo.md');
    const mark = loadMark(root);
    expect(mark.entries.demo).toBeDefined();
    expect(mark.entries.demo?.title).toBe('Demo MD');
    expect(fs.existsSync(path.join(root, '.flowspec', 'workspace.json'))).toBe(true);
    // no tmp leftover
    const files = fs.readdirSync(path.join(root, '.flowspec'));
    expect(files.some((f) => f.includes('.tmp.'))).toBe(false);
  });

  it('add with --id override', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd({ title: 'Demo MD' }), 'utf-8');
    const res = handleAddFlowSpec(file, { id: 'my-custom', root });
    expect(res.id).toBe('my-custom');
    expect(loadMark(root).entries['my-custom']).toBeDefined();
  });

  it('add with --preview writes both registries', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd({ title: 'Demo MD' }), 'utf-8');
    handleAddFlowSpec(file, { preview: true, root });
    expect(loadMark(root).entries.demo).toBeDefined();
    expect(loadPreview(root).entries.demo).toBeDefined();
  });

  it('add warns but still registers when file not under flowspec/', () => {
    const file = path.join(root, 'other.md');
    fs.writeFileSync(file, mkValidMd({ title: 'Demo MD' }), 'utf-8');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = handleAddFlowSpec(file, { root });
    expect(res.relPath).toBe('other.md');
    expect(loadMark(root).entries.other).toBeDefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('add error — file not found', () => {
    expect(() => handleAddFlowSpec(path.join(root, 'missing.md'), { root })).toThrow(
      /File not found/
    );
  });

  it('add error — invalid FlowSpec (no blocks)', () => {
    const file = path.join(root, 'flowspec/bad.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# just notes\nno blocks', 'utf-8');
    expect(() => handleAddFlowSpec(file, { root })).toThrow(/parse failed|Invalid FlowSpec/);
  });

  it('add path is repo-relative', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd(), 'utf-8');
    const res = handleAddFlowSpec(file, { root });
    expect(res.relPath).toBe('flowspec/demo.md');
    expect(loadMark(root).entries[res.id]?.path).toBe('flowspec/demo.md');
  });
});

describe('flow check', () => {
  let root: string;
  beforeEach(() => {
    root = tmpRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('check single id ok', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd({ title: 'Demo MD' }), 'utf-8');
    handleAddFlowSpec(file, { root });
    const results = handleCheckFlowSpec('demo', { root });
    expect(results.length).toBe(1);
    expect(results[0]?.ok).toBe(true);
  });

  it('check single path ok', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd({ title: 'Demo MD' }), 'utf-8');
    handleAddFlowSpec(file, { root });
    const results = handleCheckFlowSpec(file, { root });
    expect(results[0]?.ok).toBe(true);
  });

  it('check detects invalid — broken edge ref', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    // create spec with invalid edge
    const badSpec = {
      ...flowSpecExample,
      title: 'Bad',
      rootId: 'root-1',
      nodes: [{ id: 'root-1', kind: 'root' as const, label: 'Root' }],
      edges: [
        {
          id: 'e1',
          source: 'root-1',
          target: 'missing',
          kind: 'hierarchical' as const,
          directed: true,
        },
      ],
    };
    const md = serializeFlowSpecToMarkdown(badSpec);
    const validFile = path.join(dir, 'valid.md');
    fs.writeFileSync(validFile, mkValidMd({ title: 'Valid' }), 'utf-8');
    handleAddFlowSpec(validFile, { root });
    // Now corrupt it
    fs.writeFileSync(validFile, md, 'utf-8');
    const results = handleCheckFlowSpec('valid', { root });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.errors.join('')).toMatch(
      /not found|target|parseFlowSpecFromMarkdown failed/
    );
  });

  it('check --all traverses mark entries', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file1 = path.join(dir, 'a.md');
    const file2 = path.join(dir, 'b.md');
    fs.writeFileSync(file1, mkValidMd({ title: 'A', rootId: 'root-1' }), 'utf-8');
    fs.writeFileSync(file2, mkValidMd({ title: 'B', rootId: 'root-1' }), 'utf-8');
    handleAddFlowSpec(file1, { root });
    handleAddFlowSpec(file2, { root });
    const results = handleCheckFlowSpec(undefined, { all: true, root });
    expect(results.length).toBe(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('check --all reports missing file', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd(), 'utf-8');
    handleAddFlowSpec(file, { root });
    fs.unlinkSync(file);
    const results = handleCheckFlowSpec(undefined, { all: true, root });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.errors[0]).toMatch(/file not found/);
  });

  it('check missing target throws or returns error', () => {
    const res = handleCheckFlowSpec('nope', { root });
    expect(res[0]?.ok).toBe(false);
    expect(res[0]?.errors[0]).toMatch(/file not found/);
  });

  it('check requires arg when not --all', () => {
    expect(() => handleCheckFlowSpec(undefined, { root })).toThrow(/Missing/);
  });

  it('check uses parseFlowSpecFromMarkdown + schema', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, '# not flowspec', 'utf-8');
    const results = handleCheckFlowSpec(file, { root });
    expect(results[0]?.ok).toBe(false);
  });
});

describe('flow remove', () => {
  let root: string;
  beforeEach(() => {
    root = tmpRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('remove happy — only registry, file stays', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd(), 'utf-8');
    handleAddFlowSpec(file, { root, preview: true });
    expect(loadMark(root).entries.demo).toBeDefined();
    expect(loadPreview(root).entries.demo).toBeDefined();
    const res = handleRemoveFlowSpec('demo', { root });
    expect(res.removedMark).toBe(true);
    expect(loadMark(root).entries.demo).toBeUndefined();
    expect(loadPreview(root).entries.demo).toBeUndefined();
    expect(fs.existsSync(file)).toBe(true);
  });

  it('remove with --delete-blocks strips blocks and sets locked:false', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    const md = mkValidMd({ title: 'Demo MD' });
    fs.writeFileSync(file, md, 'utf-8');
    handleAddFlowSpec(file, { root });
    expect(fs.readFileSync(file, 'utf-8')).toContain('^^^node:');
    handleRemoveFlowSpec('demo', { root, deleteBlocks: true });
    const after = fs.readFileSync(file, 'utf-8');
    expect(after).not.toContain('^^^');
    expect(after).toContain('title: Demo MD');
    expect(after).toContain('# Demo MD');
    const lock = readLockFromMarkdown(after);
    expect(lock?.locked).toBe(false);
  });

  it('remove --delete-blocks preserves body markdown', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const body = 'Intro paragraph\n\n## Section\nSome *markdown* here.';
    const spec = { ...flowSpecExample, title: 'WithBody', rootId: 'root-1' };
    const md = serializeFlowSpecToMarkdown(spec, { bodyMarkdown: body });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, md, 'utf-8');
    handleAddFlowSpec(file, { root });
    handleRemoveFlowSpec('demo', { root, deleteBlocks: true });
    const after = fs.readFileSync(file, 'utf-8');
    expect(after).toContain('Intro paragraph');
    expect(after).toContain('## Section');
  });

  it('remove error — id not found', () => {
    expect(() => handleRemoveFlowSpec('nope', { root })).toThrow(/not found/);
  });

  it('remove without delete-blocks leaves blocks intact', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'demo.md');
    fs.writeFileSync(file, mkValidMd(), 'utf-8');
    handleAddFlowSpec(file, { root });
    handleRemoveFlowSpec('demo', { root, deleteBlocks: false });
    expect(fs.readFileSync(file, 'utf-8')).toContain('^^^node:');
  });
});

describe('flow move', () => {
  let root: string;
  beforeEach(() => {
    root = tmpRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('move happy — rename file and update registry', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'demo.md');
    const dest = path.join(dir, 'renamed.md');
    fs.writeFileSync(src, mkValidMd({ title: 'Demo MD' }), 'utf-8');
    handleAddFlowSpec(src, { root, preview: true });
    const res = handleMoveFlowSpec(src, dest, { root });
    expect(res.destId).toBe('renamed');
    expect(fs.existsSync(src)).toBe(false);
    expect(fs.existsSync(dest)).toBe(true);
    expect(loadMark(root).entries.demo).toBeUndefined();
    expect(loadMark(root).entries.renamed).toBeDefined();
    expect(loadMark(root).entries.renamed?.path).toBe('flowspec/renamed.md');
    expect(loadPreview(root).entries.renamed).toBeDefined();
  });

  it('move cross-directory', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'demo.md');
    const dest = path.join(dir, 'team', 'nested.md');
    fs.writeFileSync(src, mkValidMd({ title: 'Demo MD' }), 'utf-8');
    handleAddFlowSpec(src, { root });
    handleMoveFlowSpec(src, dest, { root });
    expect(fs.existsSync(dest)).toBe(true);
    expect(loadMark(root).entries.nested).toBeDefined();
    expect(loadMark(root).entries.nested?.path).toBe('flowspec/team/nested.md');
  });

  it('move error — dest exists', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'a.md');
    const dest = path.join(dir, 'b.md');
    fs.writeFileSync(src, mkValidMd({ title: 'A' }), 'utf-8');
    fs.writeFileSync(dest, mkValidMd({ title: 'B' }), 'utf-8');
    handleAddFlowSpec(src, { root });
    handleAddFlowSpec(dest, { root });
    expect(() => handleMoveFlowSpec(src, dest, { root })).toThrow(/already exists/);
  });

  it('move error — dest id already in registry', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'a.md');
    const dest = path.join(dir, 'b.md');
    fs.writeFileSync(src, mkValidMd({ title: 'A' }), 'utf-8');
    fs.writeFileSync(dest, mkValidMd({ title: 'B' }), 'utf-8');
    handleAddFlowSpec(src, { root });
    handleAddFlowSpec(dest, { root });
    // delete dest file but keep registry entry, then try move src -> dest path same id collision
    fs.unlinkSync(dest);
    expect(() => handleMoveFlowSpec(src, dest, { root })).toThrow(/already exists/);
  });

  it('move error — src not found', () => {
    expect(() =>
      handleMoveFlowSpec(path.join(root, 'nope.md'), path.join(root, 'dest.md'), { root })
    ).toThrow(/Source not found/);
  });

  it('move validates dest still legal', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'demo.md');
    fs.writeFileSync(src, mkValidMd(), 'utf-8');
    handleAddFlowSpec(src, { root });
    // Corrupt after move? We move then file is still valid, but if we try to move a broken file it should have failed on add; here we test move succeeds then validates.
    // For invalid after move, we can manually test by moving valid file then overwriting? Instead test that move of valid file passes validation
    const dest = path.join(dir, 'moved.md');
    const res = handleMoveFlowSpec(src, dest, { root });
    expect(res.destId).toBe('moved');
    const parsed = parseFlowSpecFromMarkdown(fs.readFileSync(dest, 'utf-8'));
    expect(parsed).not.toBeNull();
  });

  it('move updates both mark and preview', () => {
    const dir = path.join(root, 'flowspec');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'demo.md');
    fs.writeFileSync(src, mkValidMd(), 'utf-8');
    handleAddFlowSpec(src, { root, preview: true });
    const dest = path.join(dir, 'renamed.md');
    handleMoveFlowSpec(src, dest, { root });
    expect(loadMark(root).entries.renamed).toBeDefined();
    expect(loadPreview(root).entries.renamed).toBeDefined();
    expect(loadMark(root).entries.demo).toBeUndefined();
    expect(loadPreview(root).entries.demo).toBeUndefined();
  });
});

describe('CLI help', () => {
  it('registers add/check/remove/move subcommands', () => {
    const program = new Command();
    registerFlowSpecCommands(program);
    const flowCmd = program.commands.find((c) => c.name() === 'flow');
    expect(flowCmd).toBeDefined();
    const names = flowCmd!.commands.map((c) => c.name());
    expect(names).toContain('add');
    expect(names).toContain('check');
    expect(names).toContain('remove');
    expect(names).toContain('move');
    // ensure existing commands still present
    expect(names).toContain('init');
    expect(names).toContain('validate');
    expect(names).toContain('preview');
    // check descriptions
    const add = flowCmd!.commands.find((c) => c.name() === 'add');
    expect(add?.description()).toMatch(/Register/);
  });
});
