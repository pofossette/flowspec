import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { flowSpecExample } from '@flowspec/domain';
import { serializeFlowSpecToMarkdown } from '@flowspec/parser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureRegistryDir,
  fullPath,
  previewPath,
  resolveRegistryDir,
  workspacePath,
} from './paths.js';
import {
  addEntry,
  addEntryAsync,
  isRegistered,
  listMark,
  listPreview,
  loadMark,
  loadPreview,
  moveEntry,
  moveEntryBetween,
  removeEntry,
  saveMark,
  saveMarkAsync,
  savePreview,
  syncFromFilesystem,
  updateEntry,
} from './store.js';
import { registrySchema } from './types.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flowspec-registry-test-'));
}

function mkEntry(overrides: Partial<{ path: string; title: string; rootId: string }> = {}) {
  const now = new Date().toISOString();
  return {
    path: overrides.path ?? 'flowspec/demo.md',
    title: overrides.title ?? 'Demo',
    rootId: overrides.rootId ?? 'root-1',
    addedAt: now,
    updatedAt: now,
  };
}

describe('registry paths', () => {
  it('resolveRegistryDir defaults to cwd', () => {
    const dir = resolveRegistryDir();
    expect(dir.endsWith('.flowspec')).toBe(true);
  });

  it('ensureRegistryDir auto-creates', () => {
    const root = tmpDir();
    const dir = resolveRegistryDir(root);
    expect(fs.existsSync(dir)).toBe(false);
    const created = ensureRegistryDir(root);
    expect(created).toBe(dir);
    expect(fs.existsSync(dir)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('workspacePath/previewPath', () => {
    const root = tmpDir();
    expect(workspacePath(root).endsWith('workspace.json')).toBe(true);
    expect(previewPath(root).endsWith('preview.json')).toBe(true);
    expect(workspacePath(root).includes('.flowspec')).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('registry store', () => {
  let root: string;

  beforeEach(() => {
    root = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('missing file init returns empty registry', () => {
    const m = loadMark(root);
    expect(m.version).toBe('1.0.0');
    expect(m.entries).toEqual({});
    expect(typeof m.updatedAt).toBe('string');
    const p = loadPreview(root);
    expect(p.entries).toEqual({});

    // also ensures schema parses
    expect(registrySchema.safeParse(m).success).toBe(true);
  });

  it('saveMark auto-creates missing dir (atomic)', () => {
    const dir = resolveRegistryDir(root);
    expect(fs.existsSync(dir)).toBe(false);
    saveMark(loadMark(root), root);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(workspacePath(root))).toBe(true);
    // no tmp leftover
    const files = fs.readdirSync(dir);
    expect(files.some((f) => f.includes('.tmp.'))).toBe(false);
  });

  it('add/remove/update/move mark entries', () => {
    // add
    addEntry(
      'mark',
      'demo',
      mkEntry({ path: 'flowspec/demo.md', title: 'Demo MD', rootId: 'root-1' }),
      root
    );
    addEntry(
      'mark',
      'complex-demo',
      mkEntry({ path: 'flowspec/complex-demo.md', title: 'Complex', rootId: 'root' }),
      root
    );
    expect(isRegistered('demo', 'mark', root)).toBe(true);
    expect(isRegistered('complex-demo', 'any', root)).toBe(true);
    expect(isRegistered('missing', 'mark', root)).toBe(false);
    expect(listMark(root).length).toBe(2);

    // update
    const upd = updateEntry('mark', 'demo', { title: 'Demo Updated' }, root);
    expect(upd).not.toBeNull();
    expect(loadMark(root).entries.demo?.title).toBe('Demo Updated');
    // update non-existent returns null
    expect(updateEntry('mark', 'nope', { title: 'x' }, root)).toBeNull();

    // move rename
    const moved = moveEntry('mark', 'demo', 'demo-renamed', root);
    expect(moved).not.toBeNull();
    expect(isRegistered('demo', 'mark', root)).toBe(false);
    expect(isRegistered('demo-renamed', 'mark', root)).toBe(true);
    expect(loadMark(root).entries['demo-renamed']?.title).toBe('Demo Updated');
    // move non-existent returns null
    expect(moveEntry('mark', 'nope', 'x', root)).toBeNull();

    // remove
    expect(removeEntry('mark', 'complex-demo', root)).toBe(true);
    expect(isRegistered('complex-demo', 'mark', root)).toBe(false);
    expect(removeEntry('mark', 'complex-demo', root)).toBe(false);
    expect(listMark(root).length).toBe(1);
  });

  it('preview registry isolated from mark', () => {
    addEntry('mark', 'demo', mkEntry({ title: 'Mark Demo' }), root);
    addEntry('preview', 'demo', mkEntry({ title: 'Preview Demo' }), root);
    expect(loadMark(root).entries.demo?.title).toBe('Mark Demo');
    expect(loadPreview(root).entries.demo?.title).toBe('Preview Demo');
    expect(listPreview(root).length).toBe(1);
    // isRegistered any checks both
    expect(isRegistered('demo', 'any', root)).toBe(true);
    expect(isRegistered('demo', 'mark', root)).toBe(true);
    expect(isRegistered('demo', 'preview', root)).toBe(true);
  });

  it('moveEntryBetween mark <-> preview', () => {
    addEntry('mark', 'demo', mkEntry({ title: 'Demo' }), root);
    const dst = moveEntryBetween('mark', 'preview', 'demo', undefined, root);
    expect(dst).not.toBeNull();
    expect(isRegistered('demo', 'mark', root)).toBe(false);
    expect(isRegistered('demo', 'preview', root)).toBe(true);
    // move back with newId
    const back = moveEntryBetween('preview', 'mark', 'demo', 'demo2', root);
    expect(back).not.toBeNull();
    expect(isRegistered('demo', 'preview', root)).toBe(false);
    expect(isRegistered('demo2', 'mark', root)).toBe(true);
    // move non-existent returns null
    expect(moveEntryBetween('mark', 'preview', 'nope', undefined, root)).toBeNull();
  });

  it('concurrent write does not corrupt (atomic tmp+rename)', async () => {
    const r1 = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      entries: { a: mkEntry({ title: 'A' }) },
    };
    const r2 = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      entries: { b: mkEntry({ title: 'B' }) },
    };
    // parallel saveMarkAsync via queue
    await Promise.all([saveMarkAsync(r1, root), saveMarkAsync(r2, root)]);
    const file = workspacePath(root);
    expect(fs.existsSync(file)).toBe(true);
    const raw = fs.readFileSync(file, 'utf-8');
    // must be valid JSON and valid registry
    const parsed = JSON.parse(raw);
    expect(registrySchema.safeParse(parsed).success).toBe(true);
    // no tmp leftover
    const dir = resolveRegistryDir(root);
    const files = fs.readdirSync(dir);
    expect(files.some((f) => f.includes('.tmp.'))).toBe(false);
  });

  it('concurrent addEntryAsync preserves both via queue', async () => {
    await Promise.all([
      addEntryAsync('mark', 'a', mkEntry({ title: 'A' }), root),
      addEntryAsync('mark', 'b', mkEntry({ title: 'B' }), root),
    ]);
    const m = loadMark(root);
    // Both should be present because queue serializes read-modify-write
    expect(m.entries.a).toBeDefined();
    expect(m.entries.b).toBeDefined();
  });

  it('syncFromFilesystem scans flowspec and validates blocks', () => {
    const flowspecDir = path.join(root, 'flowspec');
    fs.mkdirSync(flowspecDir, { recursive: true });

    // valid new block syntax
    const validSpec = { ...flowSpecExample, title: 'Demo MD', rootId: 'root-1' };
    const mdContent = serializeFlowSpecToMarkdown(validSpec);
    fs.writeFileSync(path.join(flowspecDir, 'demo.md'), mdContent, 'utf-8');

    // valid legacy xml (old flowspec/demo.md)
    const legacy = `# Legacy\n\n> version: 1.0.0 | root: root | updated: 2026-08-29T00:00:00.000Z\n\n## Graph\n\n<flow-spec version="1.0.0" rootId="root">\n  <node id="root" kind="root" label="Root" />\n  <node id="n1" kind="branch" label="Branch" />\n  <edge id="e1" source="root" target="n1" kind="hierarchical" />\n</flow-spec>\n`;
    fs.writeFileSync(path.join(flowspecDir, 'legacy.md'), legacy, 'utf-8');

    // valid json
    fs.writeFileSync(
      path.join(flowspecDir, 'via-json.json'),
      JSON.stringify(validSpec, null, 2),
      'utf-8'
    );

    // invalid md (no blocks, not flowspec)
    fs.writeFileSync(path.join(flowspecDir, 'invalid.md'), '# just notes\nno blocks here', 'utf-8');
    // invalid json (fails schema)
    fs.writeFileSync(path.join(flowspecDir, 'bad.json'), JSON.stringify({ title: 'bad' }), 'utf-8');

    // nested file
    const nestedDir = path.join(flowspecDir, 'team');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(
      path.join(nestedDir, 'nested.md'),
      mdContent.replace('Demo MD', 'Nested'),
      'utf-8'
    );

    const reg = syncFromFilesystem(root, { flowspecDir });
    // should have demo, legacy, via-json, team/nested = 4 entries, not invalid/bad
    expect(Object.keys(reg.entries).length).toBe(4);
    expect(reg.entries.demo).toBeDefined();
    expect(reg.entries.legacy).toBeDefined();
    expect(reg.entries['via-json']).toBeDefined();
    expect(reg.entries['team/nested']).toBeDefined();
    expect(reg.entries.invalid).toBeUndefined();
    expect(reg.entries.bad).toBeUndefined();
    // paths are repo-relative
    expect(reg.entries.demo?.path).toBe('flowspec/demo.md');
    expect(reg.entries['team/nested']?.path).toBe('flowspec/team/nested.md');

    // prune: remove a file then resync should prune
    fs.unlinkSync(path.join(flowspecDir, 'legacy.md'));
    const reg2 = syncFromFilesystem(root, { flowspecDir });
    expect(reg2.entries.legacy).toBeUndefined();
    expect(Object.keys(reg2.entries).length).toBe(3);

    // without prune should keep stale
    fs.unlinkSync(path.join(flowspecDir, 'via-json.json'));
    const reg3 = syncFromFilesystem(root, { flowspecDir, prune: false });
    expect(reg3.entries['via-json']).toBeDefined();
  });

  it('syncFromFilesystem handles missing flowspec dir', () => {
    const reg = syncFromFilesystem(root, { flowspecDir: path.join(root, 'no-such-dir') });
    expect(reg.entries).toEqual({});
    // default kind is now 'full', so full.json is created
    expect(fs.existsSync(fullPath(root))).toBe(true);
  });

  it('savePreview and listPreview round-trip', () => {
    savePreview(loadPreview(root), root);
    addEntry(
      'preview',
      'tmp-preview',
      mkEntry({ title: 'Tmp', rootId: 'r1', path: 'flowspec/tmp.md' }),
      root
    );
    expect(listPreview(root).some((e) => e.id === 'tmp-preview')).toBe(true);
    expect(isRegistered('tmp-preview', 'preview', root)).toBe(true);
    expect(isRegistered('tmp-preview', 'mark', root)).toBe(false);
  });

  it('atomic writes preserve version and updatedAt', () => {
    const before = loadMark(root);
    const beforeUpdated = before.updatedAt;
    // small delay to ensure updatedAt changes
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait 5ms
    }
    saveMark(before, root);
    const after = loadMark(root);
    expect(after.version).toBe('1.0.0');
    expect(after.updatedAt).not.toBe(beforeUpdated);
  });
});

describe('file-lock frontmatter helpers', () => {
  it('readLockFromMarkdown and writeLockToMarkdown round-trip', async () => {
    const { readLockFromMarkdown, writeLockToMarkdown } = await import('@flowspec/lock');
    const base = serializeFlowSpecToMarkdown(flowSpecExample);
    // base has locked:false
    const lock = readLockFromMarkdown(base);
    expect(lock).not.toBeNull();
    expect(lock?.locked).toBe(false);

    const withLock = writeLockToMarkdown(base, {
      locked: true,
      holder: 'web:alice',
      lockReason: 'web-edit',
      note: 'review',
      acquiredAt: '2026-08-30T00:00:00.000Z',
    });
    const parsed = readLockFromMarkdown(withLock);
    expect(parsed?.locked).toBe(true);
    expect(parsed?.holder).toBe('web:alice');
    expect(parsed?.lockReason).toBe('web-edit');
    expect(parsed?.note).toBe('review');
    expect(parsed?.acquiredAt).toBe('2026-08-30T00:00:00.000Z');

    // clearing lock
    const cleared = writeLockToMarkdown(withLock, { locked: false, holder: '', note: '' });
    const clearedLock = readLockFromMarkdown(cleared);
    expect(clearedLock?.locked).toBe(false);
    expect(clearedLock?.holder).toBeUndefined();

    // no frontmatter => null
    expect(readLockFromMarkdown('# just title\ncontent')).toBeNull();

    // write to content without frontmatter prepends
    const noFm = '# Title\n\nBody';
    const withFm = writeLockToMarkdown(noFm, { locked: true, holder: 'agent:1' });
    expect(withFm.startsWith('---\n')).toBe(true);
    expect(readLockFromMarkdown(withFm)?.holder).toBe('agent:1');
  });
});
