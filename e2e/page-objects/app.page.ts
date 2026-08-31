import type { Locator, Page } from '@playwright/test';
import { vCursor, type VCursorHelper, type VCursorOptions } from '../helpers/v-cursor.js';

export class AppPage {
  public cursor: VCursorHelper;

  constructor(
    public page: Page,
    cursor?: VCursorHelper,
    private cursorOpts?: VCursorOptions,
  ) {
    this.cursor = cursor ?? vCursor(page, cursorOpts);
  }

  gotoFlowspec(url: string): Promise<null | import('@playwright/test').Response> {
    return this.page.goto(url);
  }

  get canvas(): Locator {
    return this.page.locator('.react-flow, [data-testid="flow-canvas"]').first();
  }

  get canvasInner(): Locator {
    return this.page.locator('[data-testid="flow-canvas"]');
  }

  get flowCanvasFallback(): Locator {
    return this.page.locator('[data-testid="flow-canvas"]');
  }

  get nodeDetail(): Locator {
    return this.page.locator('[data-testid="node-detail"]');
  }

  get blockEditor(): Locator {
    return this.page.locator('[data-testid="block-editor"]');
  }

  get leftNav(): Locator {
    return this.page.locator('[data-testid="left-nav"]');
  }

  get flowList(): Locator {
    return this.page.locator('[data-testid="flow-list"]');
  }

  flowListItem(id: string): Locator {
    return this.page.locator(`[data-testid="flow-list-item"][data-flow-id="${id}"]`);
  }

  get flowListItems(): Locator {
    return this.page.locator('[data-testid="flow-list-item"]');
  }

  get flowTitle(): Locator {
    return this.page.locator('[data-testid="flow-title"]');
  }

  get lockBanner(): Locator {
    return this.page.locator('[data-testid="lock-banner"]');
  }

  get editToggle(): Locator {
    return this.page.locator('[data-testid="edit-toggle"]');
  }

  get saveButton(): Locator {
    return this.page.locator('[data-testid="save-button"]');
  }

  get appHeader(): Locator {
    return this.page.locator('[data-testid="app-header"]');
  }

  get flowAside(): Locator {
    return this.page.locator('[data-testid="flow-aside"]');
  }

  get reactFlowNodes(): Locator {
    return this.page.locator('.react-flow__node');
  }

  nodeContainerById(id: string): Locator {
    // React Flow node wrapper has data-id attribute
    return this.page.locator(`.react-flow__node[data-id="${id}"]`);
  }

  get nodeTitleInput(): Locator {
    return this.page.locator('[data-testid="node-title-input"]');
  }

  get blockEditorEditable(): Locator {
    // BlockNote's ProseMirror contenteditable inside block-editor
    return this.page.locator('[data-testid="block-editor"] .ProseMirror, [data-testid="block-editor"] [contenteditable="true"]').first();
  }

  async ensureEditMode(): Promise<void> {
    // Click edit toggle if not already in edit mode (button shows "编辑")
    const editBtn = this.editToggle;
    try {
      const text = await editBtn.textContent({ timeout: 2000 });
      if (text && text.includes('编辑') && !text.includes('预览')) {
        await this.cursor.click(editBtn);
        // wait for edit banner or lock banner with owned
        await this.page.waitForTimeout(800);
      }
    } catch {
      // ignore
    }
  }
}
