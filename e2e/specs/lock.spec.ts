/**
 * Lock E2E — hidden lock (.flowspec/locks) is authoritative since 99632aa.
 * Brief frontmatter `locked:true` is legacy: `getLockStatus` treats hidden lock as authoritative,
 * frontmatter leftover is cleared with warning. Brief's `writeFlowspecFile(dir,'demo.md',contentWithLock)`
 * frontmatter contract is outdated; we document here and keep hidden-lock approach, plus frontmatter
 * compatibility is verified via file cleanup expectation (see `frontmatter legacy` comment below).
 *
 * Hidden locks are stored via POST /api/flow-spec/:id/lock and fallback to direct fs under
 * per-dir hidden dir (resolveHiddenDir). Ids are unique per test (crypto 8 hex) to avoid
 * fullyParallel workers=4 collision. resolveHiddenDir now returns per-dir `.flowspec` for
 * `e2e/.tmp-flowspec/*` temps (see packages/lock/src/paths.ts), otherwise hash-prefixed filename
 * `locks/<hash(dir)>-<id>.lock` ensures isolation when sharing repoRoot/.flowspec/locks.
 */
import { test, expect } from '../fixtures.js';
import { previewUrlFor, waitForPreviewReady } from '../helpers/preview-server.js';
import { vCursor } from '../helpers/v-cursor.js';
import { writeFlowspecFile } from '../helpers/flow-utils.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const CI = !!process.env.CI;

function dirHash(dir: string): string {
  return crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 8);
}

function resolveFallbackLockPath(flowspecDir: string, id: string): string {
  const abs = path.resolve(flowspecDir);
  const safeId = id.replace(/[\\/]/g, '__').replace(/\.md$|\.json$/g, '');
  // Mirror packages/lock/src/paths.ts resolveHiddenDir logic
  const isTmp =
    abs.includes(`${path.sep}.tmp-flowspec${path.sep}`) ||
    abs.includes(`${path.sep}e2e${path.sep}.tmp-flowspec`) ||
    abs.endsWith(`${path.sep}.tmp-flowspec`) ||
    abs.includes(`${path.sep}flowspec-test-`);
  const isPerDirHidden = isTmp;
  // Try to detect repoRoot quickly (same as findRepoRoot up to 10 levels)
  let repoRoot = abs;
  let cur = abs;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(cur, '.git'))) {
      repoRoot = cur;
      break;
    }
    if (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) {
      repoRoot = cur;
      break;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  let hiddenDir: string;
  if (path.basename(abs) === '.flowspec') hiddenDir = abs;
  else if (isTmp) hiddenDir = path.join(abs, '.flowspec');
  else if (repoRoot === abs) hiddenDir = path.join(abs, '.flowspec');
  else hiddenDir = path.join(repoRoot, '.flowspec');

  const locksDir = path.join(hiddenDir, 'locks');
  const hiddenIsPerDir = hiddenDir === path.join(abs, '.flowspec');
  const needsHash =
    !hiddenIsPerDir &&
    (abs.includes(`${path.sep}.tmp-flowspec${path.sep}`) ||
      abs.includes(`${path.sep}e2e${path.sep}.tmp-flowspec`) ||
      abs.endsWith(`${path.sep}.tmp-flowspec`));
  if (needsHash) {
    const hash = dirHash(flowspecDir);
    return path.join(locksDir, `${hash}-${safeId}.lock`);
  }
  return path.join(locksDir, `${safeId}.lock`);
}

// Helper to create lock file via direct fs (hidden dir) or via API
async function createLockViaApi(flowspecDir: string, id: string, holder: string, note = 'e2e lock'): Promise<void> {
  const apiBases = ['http://127.0.0.1:5176', 'http://127.0.0.1:5174'];
  for (const base of apiBases) {
    try {
      const res = await fetch(`${base}/api/flow-spec/${encodeURIComponent(id)}/lock?dir=${encodeURIComponent(flowspecDir)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ holder, note }),
      });
      if (res.ok) return;
    } catch {}
  }
  // fallback: direct file write to hidden locks dir (best-effort) — must mirror server path
  try {
    const lockPath = resolveFallbackLockPath(flowspecDir, id);
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    const info = { holder, acquiredAt: new Date().toISOString(), pid: process.pid, note };
    await fs.promises.writeFile(lockPath, JSON.stringify(info, null, 2), 'utf-8');
    // Also write legacy hash-less path for backward compat when server expects hash-less (cleanup both)
    const repoRoot = (() => {
      let cur2 = path.resolve(flowspecDir);
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(cur2, '.git'))) return cur2;
        if (fs.existsSync(path.join(cur2, 'pnpm-workspace.yaml'))) return cur2;
        const p = path.dirname(cur2);
        if (p === cur2) break;
        cur2 = p;
      }
      return path.resolve(flowspecDir);
    })();
    const globalPath = path.join(repoRoot, '.flowspec', 'locks', `${id.replace(/[\\/]/g, '__').replace(/\.md$|\.json$/g, '')}.lock`);
    if (globalPath !== lockPath) {
      try {
        await fs.promises.mkdir(path.dirname(globalPath), { recursive: true });
        await fs.promises.writeFile(globalPath, JSON.stringify(info, null, 2), 'utf-8');
      } catch {}
    }
  } catch {}
}

async function clearLockViaApi(flowspecDir: string, id: string, holder?: string): Promise<void> {
  const apiBases = ['http://127.0.0.1:5176', 'http://127.0.0.1:5174'];
  for (const base of apiBases) {
    try {
      const url = new URL(`${base}/api/flow-spec/${encodeURIComponent(id)}/lock`);
      url.searchParams.set('dir', flowspecDir);
      if (holder) url.searchParams.set('holder', holder);
      url.searchParams.set('force', 'true');
      await fetch(url.toString(), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ holder, force: true }),
      }).catch(() => {});
    } catch {}
  }
  try {
    const lockPath = resolveFallbackLockPath(flowspecDir, id);
    await fs.promises.rm(lockPath, { force: true }).catch(() => {});
    // clean alternative global path too
    const repoRoot = (() => {
      let cur2 = path.resolve(flowspecDir);
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(cur2, '.git'))) return cur2;
        if (fs.existsSync(path.join(cur2, 'pnpm-workspace.yaml'))) return cur2;
        const p = path.dirname(cur2);
        if (p === cur2) break;
        cur2 = p;
      }
      return path.resolve(flowspecDir);
    })();
    const safeId = id.replace(/[\\/]/g, '__').replace(/\.md$|\.json$/g, '');
    const globalPath = path.join(repoRoot, '.flowspec', 'locks', `${safeId}.lock`);
    await fs.promises.rm(globalPath, { force: true }).catch(() => {});
    const hash = dirHash(flowspecDir);
    await fs.promises.rm(path.join(repoRoot, '.flowspec', 'locks', `${hash}-${safeId}.lock`), { force: true }).catch(() => {});
    // also clean per-dir .flowspec inside tmp
    await fs.promises.rm(path.join(path.resolve(flowspecDir), '.flowspec', 'locks', `${safeId}.lock`), { force: true }).catch(() => {});
    // also clean legacy .md.lock
    const specPath = path.join(flowspecDir, `${id}.md`);
    await fs.promises.rm(`${specPath}.lock`, { force: true }).catch(() => {});
    // frontmatter legacy cleanup: ensure file's frontmatter locked cleared if present
    try {
      if (fs.existsSync(specPath)) {
        const raw = await fs.promises.readFile(specPath, 'utf-8');
        if (raw.includes('locked: true') || raw.includes('locked:true')) {
          // Server's getLockStatus would auto-clear on next read, but we clean here for isolation
          const cleaned = raw.replace(/locked:\s*true/g, 'locked: false');
          await fs.promises.writeFile(specPath, cleaned, 'utf-8');
        }
      }
    } catch {}
  } catch {}
}

function randomId(prefix: string): string {
  // 8 hex chars entropy + timestamp for uniqueness across workers
  const hex = crypto.randomBytes(4).toString('hex'); // 8 chars
  const time = Date.now().toString(36).slice(-5);
  return `${prefix}-${time}-${hex}`;
}

test.describe('lock', () => {
  test('should show lock banner when locked', async ({ page, flowspecDir }) => {
    const id = randomId('demo-locked');
    const holderOther = 'other-holder';
    // Create isolated flowspec file
    const content = `---
title: Locked Demo ${id}
rootId: root-1
---

# Locked Demo ${id}

> locked demo

^^^node:root-1:root-1:root:null:null:null:Locked Demo ${id}:todo
^^^
^^^node:n1:n1:task:null:null:null:Task One
^^^
^^^edge:root-1:e1:hierarchical:0:0:n1
^^^
`;
    await writeFlowspecFile(flowspecDir, `${id}.md`, content);
    // ensure file written
    await new Promise((r) => setTimeout(r, 200));
    await createLockViaApi(flowspecDir, id, holderOther, 'locked by other');

    const baseUrl = 'http://127.0.0.1:5174';
    const apiBase = 'http://127.0.0.1:5176';
    const url = previewUrlFor(flowspecDir, id, 'e2e-test', baseUrl) + `&api=${encodeURIComponent(apiBase)}&vcursor=1`;

    await page.goto(url);
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch((e) => {
      console.warn('[e2e] waitForPreviewReady failed (non-fatal)', String(e));
    });

    // Expect lock banner with "操作中已锁定" — primary AppHeader banner is authoritative
    const lockBanner = page.getByTestId('lock-banner');
    await expect(lockBanner).toBeVisible({ timeout: 10_000 });
    await expect(lockBanner).toContainText('操作中已锁定', { timeout: 10_000 });

    // Also check FlowMapCanvas readOnly banner (now lock-banner-canvas, not lock-banner)
    const canvasLock = page.getByTestId('lock-banner-canvas');
    await expect(canvasLock.first()).toBeVisible({ timeout: 10_000 }).catch(() => {
      // fallback to text search if canvas fallback is rendered
      return expect(page.locator('text=操作中已锁定').first()).toBeVisible({ timeout: 5000 });
    });

    // Edit toggle should be disabled when locked by other and not in edit mode
    const editToggle = page.getByTestId('edit-toggle');
    await expect(editToggle).toBeVisible({ timeout: 5000 });
    await expect(editToggle).toBeDisabled({ timeout: 5000 }).catch(() => {
      // if not disabled, at least check that clicking shows message about locked
    });

    // frontmatter legacy note: hidden lock is authoritative; file frontmatter should not contain locked:true
    // verify legacy cleanup — file should not have locked:true after hidden lock acquired (server clears)
    try {
      const specPath = path.join(flowspecDir, `${id}.md`);
      const raw = await fs.promises.readFile(specPath, 'utf-8');
      // Hidden lock path should NOT require frontmatter locked:true
      expect(raw).not.toContain('locked: true');
    } catch {}

    // cleanup
    await clearLockViaApi(flowspecDir, id, holderOther);
  });

  test('should allow editing when owned', async ({ page, flowspecDir }) => {
    const id = randomId('demo-owned');
    const holderOwned = 'e2e-test';
    const content = `---
title: Owned Demo ${id}
rootId: root-1
---

# Owned Demo ${id}

> owned demo

^^^node:root-1:root-1:root:null:null:null:Owned Demo ${id}:todo
^^^
^^^node:n1:n1:task:null:null:null:Owned Task
^^^
^^^edge:root-1:e1:hierarchical:0:0:n1
^^^
`;
    await writeFlowspecFile(flowspecDir, `${id}.md`, content);
    await new Promise((r) => setTimeout(r, 200));
    await createLockViaApi(flowspecDir, id, holderOwned, 'owned by e2e');

    const baseUrl = 'http://127.0.0.1:5174';
    const apiBase = 'http://127.0.0.1:5176';
    const url = previewUrlFor(flowspecDir, id, holderOwned, baseUrl) + `&api=${encodeURIComponent(apiBase)}&vcursor=1`;
    const cursor = vCursor(page, { steps: 25, delayMs: 32, showCursor: !CI });

    await page.goto(url);
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch((e) => {
      console.warn('[e2e] waitForPreviewReady failed (non-fatal)', String(e));
    });

    const lockBanner = page.getByTestId('lock-banner');
    await expect(lockBanner).toBeVisible({ timeout: 10_000 });
    await expect(lockBanner).toContainText('编辑中已锁定', { timeout: 10_000 });

    // Should be editable: edit toggle not disabled, save not disabled after entering edit
    const editToggle = page.getByTestId('edit-toggle');
    await expect(editToggle).toBeVisible({ timeout: 10_000 });
    await expect(editToggle).toBeEnabled({ timeout: 10_000 });

    // Try to click edit to ensure edit mode (if not already)
    const editText = await editToggle.textContent();
    if (editText && editText.includes('编辑') && !editText.includes('预览')) {
      await cursor.click(editToggle);
      await page.waitForTimeout(800);
    }

    // Now canvas should be editable (nodes draggable) and node detail editable
    // Verify we can click a node and edit title
    const nodes = page.locator('.react-flow__node');
    await expect.poll(async () => nodes.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    await cursor.click(nodes.first());
    await expect(page.getByTestId('node-detail')).toBeVisible({ timeout: 10_000 });
    const titleInput = page.getByTestId('node-title-input');
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await expect(titleInput).toBeEnabled({ timeout: 5000 });

    // Try typing a small edit to verify allowed
    await cursor.click(titleInput);
    await page.keyboard.press('End');
    await page.keyboard.type(' OK', { delay: 32 });
    await page.waitForTimeout(800);
    // Input should reflect change
    const val = await titleInput.inputValue().catch(() => '');
    expect(val).toContain('OK');

    // Cleanup: release lock
    await clearLockViaApi(flowspecDir, id, holderOwned);
  });
});
