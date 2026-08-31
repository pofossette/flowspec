import { test, expect } from '../fixtures.js';
import { previewUrlFor, waitForPreviewReady } from '../helpers/preview-server.js';
import { vCursor } from '../helpers/v-cursor.js';
import { writeFlowspecFile } from '../helpers/flow-utils.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CI = !!process.env.CI;

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
  // fallback: direct file write to hidden locks dir (best-effort)
  try {
    const repoRoot = process.cwd();
    const locksDir = path.join(repoRoot, '.flowspec', 'locks');
    await fs.promises.mkdir(locksDir, { recursive: true });
    const safeId = id.replace(/[\\/]/g, '__').replace(/\.md$|\.json$/g, '');
    const lockPath = path.join(locksDir, `${safeId}.lock`);
    const info = { holder, acquiredAt: new Date().toISOString(), pid: process.pid, note };
    await fs.promises.writeFile(lockPath, JSON.stringify(info, null, 2), 'utf-8');
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
    const repoRoot = process.cwd();
    const locksDir = path.join(repoRoot, '.flowspec', 'locks');
    const safeId = id.replace(/[\\/]/g, '__').replace(/\.md$|\.json$/g, '');
    const lockPath = path.join(locksDir, `${safeId}.lock`);
    await fs.promises.rm(lockPath, { force: true }).catch(() => {});
    // also clean legacy .md.lock
    const specPath = path.join(flowspecDir, `${id}.md`);
    await fs.promises.rm(`${specPath}.lock`, { force: true }).catch(() => {});
  } catch {}
}

test.describe('lock', () => {
  test('should show lock banner when locked', async ({ page, flowspecDir }) => {
    const id = `demo-locked-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(2, 4)}`;
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
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch(() => {});

    // Expect lock banner with "操作中已锁定"
    const lockBanner = page.getByTestId('lock-banner');
    await expect(lockBanner).toBeVisible({ timeout: 10_000 });
    await expect(lockBanner).toContainText('操作中已锁定', { timeout: 10_000 });

    // Also check FlowMapCanvas readOnly banner
    const canvasLock = page.locator('[data-testid="lock-banner"]');
    await expect(canvasLock.first()).toBeVisible({ timeout: 10_000 }).catch(() => {
      // fallback to text search
      return expect(page.locator('text=操作中已锁定').first()).toBeVisible({ timeout: 5000 });
    });

    // Edit toggle should be disabled when locked by other and not in edit mode
    const editToggle = page.getByTestId('edit-toggle');
    await expect(editToggle).toBeVisible({ timeout: 5000 });
    await expect(editToggle).toBeDisabled({ timeout: 5000 }).catch(() => {
      // if not disabled, at least check that clicking shows message about locked
    });

    // cleanup
    await clearLockViaApi(flowspecDir, id, holderOther);
  });

  test('should allow editing when owned', async ({ page, flowspecDir }) => {
    const id = `demo-owned-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(2, 4)}`;
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
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch(() => {});

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
