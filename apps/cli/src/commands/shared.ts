import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isMarkdownFlowSpec,
  parseFlowSpecFromMarkdown,
  safeParseFlowSpec,
  serializeFlowSpecToMarkdown,
} from '@flowspec/domain';
import { ensureRegistryDir, resolveRegistryDir } from '@flowspec/registry';

export function pidFilePath(dir: string): string {
  // 统一落在 .flowspec/ 下，避免散落在 flowspec 文档目录；按 --dir 隔离
  try {
    ensureRegistryDir();
  } catch {}
  const registryDir = resolveRegistryDir();
  const baseName = path.basename(path.resolve(dir));
  const safe = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'flowspec';
  const base = safe === 'flowspec' ? 'serve.pid' : `serve.${safe}.pid`;
  return path.join(registryDir, base);
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EPERM') return true;
    return false;
  }
}

export function resolveDir(cwd: string, dir: string): string {
  return path.isAbsolute(dir) ? path.resolve(dir) : path.resolve(cwd, dir);
}

export async function syncFromFilesystemSafe(root?: string): Promise<void> {
  try {
    const { syncFromFilesystem } = await import('@flowspec/registry');
    syncFromFilesystem(path.resolve(root ?? process.cwd()));
  } catch (e: unknown) {
    if (process.env.DEBUG) console.warn('[flowspec] syncFromFilesystem failed', e);
  }
}

// alias per brief spec name `syncFromFilesystem` wrapper
export const syncFromFilesystem = syncFromFilesystemSafe;

export function deriveIdFromPath(filePath: string, explicitId?: string): string {
  if (explicitId && explicitId.trim().length > 0) return explicitId.trim();
  const base = path.basename(filePath);
  const ext = path.extname(base);
  if (ext) return base.slice(0, -ext.length);
  return base;
}

export function toRepoRelative(absPath: string, repoRoot?: string): string {
  const root = repoRoot ? path.resolve(repoRoot) : process.cwd();
  const rel = path.relative(root, path.resolve(absPath));
  return rel.split(path.sep).join('/');
}

export function readSpec(file: string): unknown {
  const abs = path.resolve(file);
  const raw = fs.readFileSync(abs, 'utf-8');
  if (isMarkdownFlowSpec(raw)) {
    const parsed = parseFlowSpecFromMarkdown(raw);
    if (parsed) return parsed;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const parsed = parseFlowSpecFromMarkdown(raw);
    if (parsed) return parsed;
    throw new Error(`Invalid spec file ${file}: not JSON nor Markdown+XML`);
  }
}

export function writeSpec(file: string, data: unknown): void {
  const abs = path.resolve(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (abs.endsWith('.md')) {
    const maybe = data as Record<string, unknown>;
    const looksSpec = maybe && typeof maybe.rootId === 'string' && Array.isArray(maybe.nodes);
    if (looksSpec) {
      const res = safeParseFlowSpec(data);
      if (res.success) {
        fs.writeFileSync(abs, serializeFlowSpecToMarkdown(res.data), 'utf-8');
        return;
      }
    }
    if (typeof data === 'string') {
      fs.writeFileSync(abs, data, 'utf-8');
      return;
    }
  }
  if (typeof data === 'string') {
    fs.writeFileSync(abs, data, 'utf-8');
    return;
  }
  fs.writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export function defaultHolder(): string {
  return `agent:${process.pid}`;
}

export function handleFlowError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function getThisDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}
