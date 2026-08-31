import { test as base, expect } from '@playwright/test';
import { prepareFlowspecDir } from './helpers/tmp-dir.js';
import { previewUrlFor, waitForPreviewReady } from './helpers/preview-server.js';

type Fixtures = {
  flowspecDir: string;
  previewUrl: string;
};

export const test = base.extend<Fixtures>({
  flowspecDir: async ({}, use) => {
    const { dir, cleanup } = await prepareFlowspecDir();
    await use(dir);
    await cleanup();
  },
  previewUrl: async ({ flowspecDir }, use) => {
    await waitForPreviewReady('http://127.0.0.1:5174');
    await use(previewUrlFor(flowspecDir, 'demo', 'e2e-test'));
  },
});

export { expect };
