import { test as base, expect } from '@playwright/test';
import { previewUrlFor, waitForPreviewReady } from './helpers/preview-server.js';
import { prepareFlowspecDir } from './helpers/tmp-dir.js';

type Fixtures = {
  flowspecDir: string;
  previewUrl: string;
};

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture requires empty object pattern
  flowspecDir: async ({}, use) => {
    const { dir, cleanup } = await prepareFlowspecDir();
    await use(dir);
    await cleanup();
  },
  previewUrl: async ({ flowspecDir }, use) => {
    await waitForPreviewReady('http://127.0.0.1:5174', flowspecDir);
    // hiddenDir is per-dir (<flowspecDir>/.flowspec) – previewUrlFor now supports passing it via query for server isolation
    const hiddenDir = `${flowspecDir}/.flowspec`;
    await use(previewUrlFor(flowspecDir, 'demo', 'e2e-test', undefined, hiddenDir));
  },
});

export { expect };
