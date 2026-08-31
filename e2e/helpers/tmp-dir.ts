import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Prepare an isolated flowspec directory for a single test/worker.
 *
 * Creates `e2e/.tmp-flowspec/<prefix>-<rand>` with a `demo.md` file
 * copied from `flowspec/demo.md` (fallback to `e2e/fixtures/flowspec-sample.md`),
 * then returns the directory and a cleanup callback.
 */
export async function prepareFlowspecDir(
  prefix = 'e2e',
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const projectRoot = process.cwd();
  const baseTmp = path.join(projectRoot, 'e2e', '.tmp-flowspec');
  await fs.promises.mkdir(baseTmp, { recursive: true });

  const rand = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const dir = path.join(baseTmp, `${prefix}-${rand}`);
  await fs.promises.mkdir(dir, { recursive: true });

  // Resolve source file: prefer flowspec/demo.md, fallback to fixtures sample.
  const candidateA = path.join(projectRoot, 'flowspec', 'demo.md');
  const candidateB = path.join(projectRoot, 'e2e', 'fixtures', 'flowspec-sample.md');
  let sourcePath: string | null = null;
  if (fs.existsSync(candidateA)) sourcePath = candidateA;
  else if (fs.existsSync(candidateB)) sourcePath = candidateB;

  if (sourcePath) {
    const content = await fs.promises.readFile(sourcePath, 'utf-8');
    await fs.promises.writeFile(path.join(dir, 'demo.md'), content, 'utf-8');
  } else {
    // Should not happen in normal repo, but create an empty placeholder to avoid 404.
    await fs.promises.writeFile(path.join(dir, 'demo.md'), '', 'utf-8');
  }

  const cleanup = async (): Promise<void> => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  };

  return { dir, cleanup };
}

/**
 * Convenience cleanup helper for use in `test.afterEach` style callbacks.
 */
export async function cleanupTmpDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
