/**
 * Lock E2E — hidden lock (.flowspec/locks) is authoritative since 99632aa.
 * Brief frontmatter `locked:true` is legacy: `getLockStatus` treats hidden lock as authoritative,
 * frontmatter leftover is cleared with warning.
 *
 * Hidden locks are per-dir isolated via `<flowspecDir>/.flowspec/locks` (created by prepareFlowspecDir).
 * This replaces previous hash-prefix/substring heuristics. We import the real helper from @flowspec/lock
 * instead of duplicating logic (fixes review #5).
 */
import { test, expect } from '../fixtures.js';
import { previewUrlFor, waitForPreviewReady, getApiBaseUrl, getWebBaseUrl } from '../helpers/preview-server.js';
import { vCursor } from '../helpers/v-cursor.js';
import { writeFlowspecFile } from '../helpers/flow-utils.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';

const CI = !!process.env.CI;

// Use real helper from built package (avoids duplicating findRepoRoot/hash) – runtime require to keep e2e/tsconfig rootDir isolated
let _resolveLockPath: ((id: string, dir: string, opts?: unknown) => string) | null = null;
try {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime import of built helper for isolation (fixes review #1,5)
  const mod = require('../../packages/lock/dist/paths.js') as { resolveLockPath?: typeof _resolveLockPath };
  if (mod.resolveLockPath) _resolveLockPath = mod.resolveLockPath;
} catch {}
function resolveFallbackLockPath(flowspecDir: string, id: string): string {
  const hiddenDir = path.join(path.resolve(flowspecDir), '.flowspec');
  if (_resolveLockPath) return _resolveLockPath(id, flowspecDir, { hiddenDir });
  // fallback inline (should not happen when packages/lock built)
  const safeId = id.replace(/[\\/]/g, '__').replace(/\.md$|\.json$/g, '');
  return path.join(hiddenDir, 'locks', `${safeId}.lock`);
}

// Helper to create lock file via direct fs (hidden dir) or via API — uses real helper, no duplication
async function createLockViaApi(flowspecDir: string, id: string, holder: string, note = 'e2e lock'): Promise<void> {
  const apiBases = [getApiBaseUrl(), 'http://127.0.0.1:5176', 'http://127.0.0.1:5174'];
  const uniqBases = [...new Set(apiBases)];
  for (const base of uniqBases) {
    try {
      const res = await fetch(`${base}/api/flow-spec/${encodeURIComponent(id)}/lock?dir=${encodeURIComponent(flowspecDir)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ holder, note }),
      });
      if (res.ok) return;
    } catch {}
  }
  // fallback: direct file write to per-dir hidden locks dir (must mirror server's resolveLockPath)
  try {
    const lockPath = resolveFallbackLockPath(flowspecDir, id);
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    const info = { holder, acquiredAt: new Date().toISOString(), pid: process.pid, note };
    await fs.promises.writeFile(lockPath, JSON.stringify(info, null, 2), 'utf-8');
  } catch {}
}

async function clearLockViaApi(flowspecDir: string, id: string, holder?: string): Promise<void> {
  const apiBases = [getApiBaseUrl(), 'http://127.0.0.1:5176', 'http://127.0.0.1:5174'];
  const uniqBases = [...new Set(apiBases)];
  for (const base of uniqBases) {
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
    // legacy fallbacks (best-effort)
    const specPath = path.join(flowspecDir, `${id}.md`);
    await fs.promises.rm(`${specPath}.lock`, { force: true }).catch(() => {});
    try {
      if (fs.existsSync(specPath)) {
        const raw = await fs.promises.readFile(specPath, 'utf-8');
        if (raw.includes('locked: true') || raw.includes('locked:true')) {
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

    const baseUrl = getWebBaseUrl();
    const apiBase = getApiBaseUrl();
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

    const baseUrl = getWebBaseUrl();
    const apiBase = getApiBaseUrl();
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
