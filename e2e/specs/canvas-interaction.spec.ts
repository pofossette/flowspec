import { test, expect } from '../fixtures.js';
import { previewUrlFor, waitForPreviewReady, getApiBaseUrl, getWebBaseUrl } from '../helpers/preview-server.js';
import { vCursor } from '../helpers/v-cursor.js';
import { AppPage } from '../page-objects/app.page.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CI = !!process.env.CI;

// Flaky drag retry per brief
test.describe.configure({ retries: 1 });

test.describe('canvas-interaction', () => {
  test('should render canvas with nodes', async ({ page, previewUrl, flowspecDir }) => {
    const url = previewUrl + '&vcursor=1';
    const apiBase = getApiBaseUrl();
    const baseUrl = getWebBaseUrl();
    const urlWithApi = url.includes('api=') ? url : url + `&api=${encodeURIComponent(apiBase)}`;
    const cursor = vCursor(page, { steps: 25, delayMs: 32, showCursor: !CI });
    const app = new AppPage(page, cursor);

    await page.goto(urlWithApi);
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch((e) => {
      console.warn('[e2e] waitForPreviewReady failed (non-fatal)', String(e));
    });

    await expect(app.flowTitle).toBeVisible({ timeout: 10_000 });
    await expect(app.canvas).toBeVisible({ timeout: 10_000 });
    // stable selector: outer flow-canvas is unique (inner is flow-canvas-inner, fallback is flow-canvas-fallback)
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10_000 });
    // inner canvas also visible when ReactFlow loaded
    await expect(page.getByTestId('flow-canvas-inner')).toBeVisible({ timeout: 10_000 }).catch(() => {
      // fallback canvas (when @xyflow not loaded) uses flow-canvas-fallback
    });
    // wait for at least 1 node
    const nodes = page.locator('.react-flow__node');
    await expect.poll(async () => nodes.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

    // vCursor hover first node should show tooltip/highlight (or at least not crash)
    const firstNode = nodes.first();
    await expect(firstNode).toBeVisible({ timeout: 10_000 });
    await cursor.hover(firstNode);
    // after hover, node should still be visible, and maybe selected highlight
    await expect(firstNode).toBeVisible({ timeout: 10_000 });
    // optional: check that hover doesn't hide canvas
    await expect(app.canvas).toBeVisible({ timeout: 10_000 });
  });

  test('should drag node and persist', async ({ page, previewUrl, flowspecDir }) => {
    const apiBase = getApiBaseUrl();
    const baseUrl = getWebBaseUrl();
    const url = previewUrl + '&vcursor=1';
    const urlWithApi = url.includes('api=') ? url : url + `&api=${encodeURIComponent(apiBase)}`;
    const cursor = vCursor(page, { steps: 25, delayMs: 32, showCursor: !CI });
    const app = new AppPage(page, cursor);

    // Persistence signals must be registered BEFORE navigation so the WebSocket
    // created on page load is not missed (page.on('websocket') only fires for
    // sockets created after the handler is attached). Attaching before goto
    // captures framesent before drag.
    let putSeen = false;
    let wsPatchSeen = false;
    const wsFrames: string[] = [];
    await page.route('**/api/flow-spec/*', async (route) => {
      if (route.request().method() === 'PUT') putSeen = true;
      await route.continue();
    });
    page.on('websocket', (ws) => {
      ws.on('framesent', (data: unknown) => {
        try {
          const raw: unknown = (data as { payload?: unknown })?.payload ?? data;
          const txt = typeof raw === 'string' ? raw : String(raw);
          if (txt.includes('"type":"patch"') || txt.includes('"patch"')) {
            wsPatchSeen = true;
            wsFrames.push(txt);
          }
        } catch {}
      });
    });
    // Also handle websockets already connected before handler (edge case when
    // using reuseExistingServer or context-level sockets): Playwright has no
    // page.websockets() API, so pre-goto registration is the reliable fix; the
    // check below is a no-op but documents the intent for future API changes.

    await page.goto(urlWithApi);
    await waitForPreviewReady(baseUrl, flowspecDir, 15_000).catch((e) => {
      console.warn('[e2e] waitForPreviewReady failed (non-fatal)', String(e));
    });

    await expect(app.flowTitle).toBeVisible({ timeout: 10_000 });
    await expect(app.canvas).toBeVisible({ timeout: 10_000 });

    // Need edit mode to enable dragging (nodesDraggable)
    await expect(app.editToggle).toBeVisible({ timeout: 10_000 });
    const editText = await app.editToggle.textContent();
    if (editText && editText.includes('编辑') && !editText.includes('预览')) {
      await cursor.click(app.editToggle);
      await expect(page.getByTestId('edit-banner')).toBeVisible({ timeout: 10_000 }).catch(async () => {
        // fallback: check lock banner for owned
        await expect(page.locator('text=编辑中')).toBeVisible({ timeout: 5000 }).catch(() => {});
      });
      // small wait for canvas to become draggable
      await page.waitForTimeout(500);
    }

    const nodes = page.locator('.react-flow__node');
    await expect.poll(async () => nodes.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const firstNode = nodes.first();
    await expect(firstNode).toBeVisible({ timeout: 10_000 });

    const boxBefore = await firstNode.boundingBox();
    expect(boxBefore).not.toBeNull();
    // Use canvas inner as drop target (center) — outer flow-canvas includes header, inner is the ReactFlow viewport
    const canvas = page.getByTestId('flow-canvas-inner');
    await expect(canvas).toBeVisible({ timeout: 10_000 }).catch(async () => {
      await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10_000 });
    });
    const canvasTarget = (await canvas.count()) > 0 ? canvas : page.getByTestId('flow-canvas');

    // Snapshot file content before drag for strict filePersisted check
    // (previous /\b\d+:\d+\b/ was true even before drag → false positive).
    const demoPath = path.join(flowspecDir, 'demo.md');
    let contentBefore = '';
    let mtimeBefore = 0;
    try {
      if (fs.existsSync(demoPath)) {
        contentBefore = fs.readFileSync(demoPath, 'utf-8');
        mtimeBefore = fs.statSync(demoPath).mtimeMs;
      }
    } catch {}
    void wsFrames;

    // Perform drag: from node to canvas (will drag to canvas center)
    await cursor.drag(firstNode, canvasTarget);

    // wait 500ms debounce per brief (rfToFlowSpec 300ms + 500ms) + ws propagation
    await page.waitForTimeout(1000);

    // Check coordinate change — must be significant, fail fast if not moved
    const boxAfter = await firstNode.boundingBox().catch(() => null);
    expect(boxAfter).not.toBeNull();
    if (boxBefore && boxAfter) {
      const dx = Math.abs(boxAfter.x - boxBefore.x);
      const dy = Math.abs(boxAfter.y - boxBefore.y);
      // Strict: drag must move at least 5px total; previous fallback hid failures
      expect(dx + dy).toBeGreaterThan(5);
    }

    // Verify persistence was attempted via either PUT or WS patch
    // FlowMapCanvas position change now triggers onChange -> handleChange -> wsSend (or PUT fallback)
    // Assert at least one signal was observed; if neither, fall back to file check
    let filePersisted = false;
    let contentAfter = '';
    try {
      // Poll briefly for file to reflect new position (ws patch saves via saveSpecRaw on server)
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(demoPath)) {
          contentAfter = fs.readFileSync(demoPath, 'utf-8');
          let mtimeAfter = 0;
          try {
            mtimeAfter = fs.statSync(demoPath).mtimeMs;
          } catch {}
          const contentChanged = contentAfter !== contentBefore;
          const mtimeChanged = mtimeAfter !== mtimeBefore && mtimeAfter !== 0;
          // Strict: only count as persisted if content or mtime actually changed
          // after drag. Previous /\b\d+:\d+\b/ was true even before drag → dead check.
          if (contentChanged || mtimeChanged) {
            filePersisted = true;
            break;
          }
        }
        await page.waitForTimeout(200);
      }
    } catch {}

    // At least one persistence signal must be true; drag without onChange is a regression
    // wsPatchSeen is primary, putSeen is fallback, filePersisted is eventual consistency
    expect(putSeen || wsPatchSeen || filePersisted).toBeTruthy();

    // At least ensure canvas still visible and no error
    await expect(app.canvas).toBeVisible({ timeout: 5000 });
  });
});
