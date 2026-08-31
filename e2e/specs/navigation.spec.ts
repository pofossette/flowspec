import { expect, test } from '../fixtures.js';
import { writeFlowspecFile } from '../helpers/flow-utils.js';
import {
  getApiBaseUrl,
  getWebBaseUrl,
  previewUrlFor,
  waitForPreviewReady,
} from '../helpers/preview-server.js';
import { vCursor } from '../helpers/v-cursor.js';

const CI = !!process.env.CI;

test.describe('navigation', () => {
  test('should load app and show flow list', async ({ page, previewUrl, flowspecDir }) => {
    const apiBase = getApiBaseUrl();
    const baseUrl = getWebBaseUrl();
    const url = `${previewUrl}&vcursor=1`;
    const urlWithApi = url.includes('api=') ? url : `${url}&api=${encodeURIComponent(apiBase)}`;
    await page.goto(urlWithApi);
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch((e) => {
      console.warn('[e2e] waitForPreviewReady failed (non-fatal)', String(e));
    });
    // primary stable selector
    await expect(page.getByTestId('flow-title')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('left-nav')).toBeVisible({ timeout: 10_000 });
    // FlowSpec text fallback – title contains Demo MD, or left nav shows flow name
    // check left nav has at least flow list or empty placeholder
    const leftNav = page.getByTestId('left-nav');
    await expect(leftNav).toBeVisible({ timeout: 10_000 });
    // flow list should be visible (even if empty shows placeholder)
    const flowList = page.getByTestId('flow-list');
    await expect(flowList).toBeVisible({ timeout: 10_000 });
    // at least Demo flow should be visible somewhere: check flow title contains Demo or root node
    await expect(page.getByTestId('flow-title')).toContainText(/Demo/i);
  });

  test('should switch flow via LeftNav', async ({ page, flowspecDir }) => {
    // Prepare second flow file before goto
    const secondId = 'second';
    const secondTitle = 'Second E2E Flow';
    const secondContent = `---
title: ${secondTitle}
rootId: root-1
---

# ${secondTitle}

> second flow for navigation test

^^^node:root-1:root-1:root:null:null:null:${secondTitle}:todo
^^^
^^^node:n1:n1:task:null:null:null:Second Task
^^^
^^^edge:root-1:e1:hierarchical:0:0:n1
^^^
`;
    await writeFlowspecFile(flowspecDir, `${secondId}.md`, secondContent);

    // Try to register second flow into workspace via API (best-effort)
    // This makes LeftNav show second item (workspace is source for LeftNav)
    const apiBase = getApiBaseUrl();
    const baseUrl = getWebBaseUrl();
    try {
      await fetch(`${apiBase}/api/workspace/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: secondId, dir: flowspecDir }),
      }).catch(() => {});
      // also ensure full is synced (trigger via full endpoint)
      await fetch(`${apiBase}/api/flow-spec/full?dir=${encodeURIComponent(flowspecDir)}`).catch(
        () => {}
      );
    } catch {}

    // Use previewUrlFor with explicit dir and holder, and include api param to ensure frontend hits dynamic port
    const previewUrl = `${previewUrlFor(flowspecDir, 'demo', 'e2e-test', baseUrl)}&api=${encodeURIComponent(apiBase)}&vcursor=1`;
    const cursor = vCursor(page, { steps: 25, delayMs: 32, showCursor: !CI });

    // Intercept workspace list to guarantee LeftNav shows both flows (deterministic)
    await page.route('**/api/flow-spec?dir=*', async (route) => {
      const reqUrl = route.request().url();
      // only mock for our isolated dir
      if (reqUrl.includes(encodeURIComponent(flowspecDir)) || reqUrl.includes(flowspecDir)) {
        const entries = [
          { id: 'demo', title: 'Demo MD', path: `${flowspecDir}/demo.md`, rootId: 'root-1' },
          {
            id: secondId,
            title: secondTitle,
            path: `${flowspecDir}/${secondId}.md`,
            rootId: 'root-1',
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, dir: flowspecDir, entries, source: 'workspace' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(previewUrl);
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch((e) => {
      console.warn('[e2e] waitForPreviewReady failed (non-fatal)', String(e));
    });

    await expect(page.getByTestId('flow-title')).toBeVisible({ timeout: 10_000 });
    const initialTitle = await page.getByTestId('flow-title').textContent();

    await expect(page.getByTestId('left-nav')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('flow-list')).toBeVisible({ timeout: 10_000 });

    // Wait for second flow item to appear (mocked)
    const secondItem = page.getByTestId('flow-list-item').filter({ hasText: secondTitle }).first();
    const secondById = page.locator(`[data-testid="flow-list-item"][data-flow-id="${secondId}"]`);
    // Prefer id selector, fallback to text
    let target = secondById;
    if ((await secondById.count()) === 0) target = secondItem;

    await expect(target).toBeVisible({ timeout: 10_000 });

    // Use vCursor to click second flow
    await cursor.click(target);

    // Expect flow title changes to secondTitle
    await expect(page.getByTestId('flow-title')).toContainText(secondTitle, { timeout: 10_000 });
    const afterTitle = await page.getByTestId('flow-title').textContent();
    expect(afterTitle).not.toEqual(initialTitle);
    expect(afterTitle).toContain(secondTitle);

    // Also verify that url id changed
    await expect
      .poll(async () => new URL(page.url()).searchParams.get('id'), { timeout: 5000 })
      .toBe(secondId);
  });
});
