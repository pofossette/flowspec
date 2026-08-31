import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_DIR = 'flowspec';

export function resolveSpecPath(id: string, flowspecDir = DEFAULT_DIR): string {
  const dir = path.resolve(flowspecDir);
  if (path.isAbsolute(id)) return id;
  if (id.startsWith(`${flowspecDir}/`) || id.startsWith(`${flowspecDir}\\`)) {
    const abs = path.resolve(id);
    if (!path.extname(abs)) {
      const mdFile = `${abs}.md`;
      const jsonFile = `${abs}.json`;
      if (fs.existsSync(mdFile)) return mdFile;
      if (fs.existsSync(jsonFile)) return jsonFile;
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        const mdInDir = path.join(abs, 'spec.md');
        const jsonInDir = path.join(abs, 'spec.json');
        if (fs.existsSync(mdInDir)) return mdInDir;
        if (fs.existsSync(jsonInDir)) return jsonInDir;
        return mdInDir;
      }
      return mdFile;
    }
    return abs;
  }
  const hasExt = !!path.extname(id);
  if (hasExt) return path.join(dir, id);
  const mdPath = path.join(dir, `${id}.md`);
  const jsonPath = path.join(dir, `${id}.json`);
  if (fs.existsSync(mdPath)) return mdPath;
  if (fs.existsSync(jsonPath)) return jsonPath;
  if (fs.existsSync(path.join(dir, id)) && fs.statSync(path.join(dir, id)).isDirectory()) {
    const mdInDir = path.join(dir, id, 'spec.md');
    const jsonInDir = path.join(dir, id, 'spec.json');
    if (fs.existsSync(mdInDir)) return mdInDir;
    if (fs.existsSync(jsonInDir)) return jsonInDir;
    return mdInDir;
  }
  return mdPath;
}

/** 查找仓库根（复用 registry 的逻辑）：向上查找 .git/pnpm-workspace.yaml */
function findRepoRoot(start: string): string {
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

/** 隐藏目录 .flowspec（与 flowspec 文档同级的隐藏目录，自动 gitignore） */
export function resolveHiddenDir(flowspecDir = DEFAULT_DIR): string {
  const abs = path.resolve(flowspecDir);
  if (path.basename(abs) === '.flowspec') return abs;
  // Isolated temp handling: e2e/.tmp-flowspec/* and os tmp flowspec-test-* should keep locks inside the tmp dir itself
  // This ensures `prepareFlowspecDir` isolation is respected even when tmp is nested under repo (repoRoot != abs)
  if (
    abs.includes(`${path.sep}.tmp-flowspec${path.sep}`) ||
    abs.includes(`${path.sep}e2e${path.sep}.tmp-flowspec`) ||
    abs.endsWith(`${path.sep}.tmp-flowspec`) ||
    abs.includes(`${path.sep}flowspec-test-`)
  ) {
    return path.join(abs, '.flowspec');
  }
  const repoRoot = findRepoRoot(abs);
  // 若 flowspecDir 本身就是一个隔离的临时目录（无 .git 的 tmp），直接在其内部创建 .flowspec，保证测试隔离
  if (repoRoot === abs) return path.join(abs, '.flowspec');
  // 否则为正常仓库：hiddenDir 位于仓库根/.flowspec（与 flowspec 文档同级隐藏）
  return path.join(repoRoot, '.flowspec');
}

/** 锁集中存储于 .flowspec/locks/<id>.lock，不污染文档目录且被 gitignore
 *  For shared hidden dirs (repoRoot/.flowspec) with temp flowspec dirs, include dir hash to avoid cross-dir collision.
 */
export function resolveLockPath(id: string, flowspecDir = DEFAULT_DIR): string {
  const hiddenDir = resolveHiddenDir(flowspecDir);
  const locksDir = path.join(hiddenDir, 'locks');
  const safeId = id.replace(/[\\/]/g, '__').replace(/\.md$|\.json$/g, '');
  const abs = path.resolve(flowspecDir);
  const hiddenIsPerDir = hiddenDir === path.join(abs, '.flowspec');
  // If hidden dir is shared (not per-dir) and flowspecDir is a tmp/e2e isolation dir, prefix with hash for true isolation
  const needsHash =
    !hiddenIsPerDir &&
    (abs.includes(`${path.sep}.tmp-flowspec${path.sep}`) ||
      abs.includes(`${path.sep}e2e${path.sep}.tmp-flowspec`) ||
      abs.endsWith(`${path.sep}.tmp-flowspec`));
  if (needsHash) {
    const hash = crypto.createHash('sha256').update(abs).digest('hex').slice(0, 8);
    return path.join(locksDir, `${hash}-${safeId}.lock`);
  }
  return path.join(locksDir, `${safeId}.lock`);
}

/** @deprecated 旧路径 `${specPath}.lock`，仅用于迁移兼容 */
export function resolveLegacyLockPath(id: string, flowspecDir = DEFAULT_DIR): string {
  const specPath = resolveSpecPath(id, flowspecDir);
  return `${specPath}.lock`;
}

export function ensureFlowspecDir(flowspecDir = DEFAULT_DIR): void {
  fs.mkdirSync(path.resolve(flowspecDir), { recursive: true });
}

export function ensureHiddenDir(flowspecDir = DEFAULT_DIR): string {
  const dir = resolveHiddenDir(flowspecDir);
  fs.mkdirSync(dir, { recursive: true });
  const locksDir = path.join(dir, 'locks');
  fs.mkdirSync(locksDir, { recursive: true });
  return dir;
}
