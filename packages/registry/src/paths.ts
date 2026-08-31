import * as fs from 'node:fs';
import * as path from 'node:path';

const REGISTRY_DIR_NAME = '.flowspec';

export function findRepoRoot(start = process.cwd()): string {
  let cur = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    if (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(start);
}

export function resolveRegistryDir(root?: string): string {
  const base = root ? path.resolve(root) : findRepoRoot();
  return path.join(base, REGISTRY_DIR_NAME);
}

export function ensureRegistryDir(root?: string): string {
  const dir = resolveRegistryDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function workspacePath(root?: string): string {
  return path.join(resolveRegistryDir(root), 'workspace.json');
}

export function markPath(root?: string): string {
  return path.join(resolveRegistryDir(root), 'mark.json');
}

export function previewPath(root?: string): string {
  return path.join(resolveRegistryDir(root), 'preview.json');
}

export function fullPath(root?: string): string {
  return path.join(resolveRegistryDir(root), 'full.json');
}
