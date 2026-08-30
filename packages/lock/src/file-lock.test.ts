import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  acquireLock,
  getLockStatus,
  loadSpecRaw,
  readLock,
  releaseLock,
  resolveLockPath,
  resolveSpecPath,
  saveSpecRaw,
} from './file-lock.js';
import { flowSpecExample } from '@flowspec/domain';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flowspec-test-'));
}

describe('file-lock', () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('acquire and status locked', () => {
    const info = acquireLock('demo', 'agent:123', { flowspecDir: dir });
    expect(info.holder).toBe('agent:123');
    const status = getLockStatus('demo', dir);
    expect(status.locked).toBe(true);
    if (status.locked) expect(status.info.holder).toBe('agent:123');
  });

  it('second acquire without force throws', () => {
    acquireLock('demo2', 'agent:1', { flowspecDir: dir });
    expect(() => acquireLock('demo2', 'agent:2', { flowspecDir: dir })).toThrow(/already locked/);
  });

  it('force steal succeeds', () => {
    acquireLock('demo3', 'agent:1', { flowspecDir: dir });
    const info = acquireLock('demo3', 'web:alice', { force: true, flowspecDir: dir });
    expect(info.holder).toBe('web:alice');
  });

  it('release by holder succeeds, mismatch throws without force', () => {
    acquireLock('demo4', 'agent:1', { flowspecDir: dir });
    expect(() => releaseLock('demo4', 'web:bob', { flowspecDir: dir })).toThrow(/holder mismatch/);
    releaseLock('demo4', 'agent:1', { flowspecDir: dir });
    expect(getLockStatus('demo4', dir).locked).toBe(false);
  });

  it('release force regardless of holder', () => {
    acquireLock('demo5', 'agent:1', { flowspecDir: dir });
    releaseLock('demo5', 'web:bob', { force: true, flowspecDir: dir });
    expect(getLockStatus('demo5', dir).locked).toBe(false);
  });

  it('lock path and spec path resolve (.md default, human-readable)', () => {
    const specPath = resolveSpecPath('myflow', dir);
    expect(specPath.endsWith('myflow.md')).toBe(true);
    const lockPath = resolveLockPath('myflow', dir);
    expect(lockPath).toBe(`${specPath}.lock`);
  });

  it('save and load spec as Markdown block', () => {
    const p = saveSpecRaw('demo', flowSpecExample, dir);
    expect(fs.existsSync(p)).toBe(true);
    expect(p.endsWith('.md')).toBe(true);
    const content = fs.readFileSync(p, 'utf-8');
    // new block syntax uses frontmatter + ^^^block, legacy XML still accepted via isMarkdownFlowSpec
    expect(content.includes('^^^block') || content.includes('<flow-spec')).toBe(true);
    expect(content).toContain('#');
    expect(content).toContain('---');
    const loaded = loadSpecRaw('demo', dir);
    // loaded is parsed FlowSpec
    expect((loaded as { title: string }).title).toBe(flowSpecExample.title);
    const read = readLock('demo', dir);
    expect(read).toBeNull(); // no lock yet
  });

  it('backward compat: json still readable', () => {
    const jsonPath = resolveSpecPath('compat', dir).replace(/\.md$/, '.json');
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(flowSpecExample, null, 2));
    const loaded = loadSpecRaw('compat', dir);
    expect((loaded as { title: string }).title).toBe(flowSpecExample.title);
  });

  it('readLock handles corrupted file as stale', () => {
    const lp = resolveLockPath('bad', dir);
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, 'not json', 'utf-8');
    const info = readLock('bad', dir);
    expect(info).toBeNull();
    expect(fs.existsSync(lp)).toBe(false);
  });
});
