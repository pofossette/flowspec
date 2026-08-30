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

/** @deprecated Old `.lock` file path — kept for backward compat. */
export function resolveLockPath(id: string, flowspecDir = DEFAULT_DIR): string {
  const specPath = resolveSpecPath(id, flowspecDir);
  return `${specPath}.lock`;
}

export function ensureFlowspecDir(flowspecDir = DEFAULT_DIR): void {
  fs.mkdirSync(path.resolve(flowspecDir), { recursive: true });
}
