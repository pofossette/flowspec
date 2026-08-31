import type { Locator, Page } from '@playwright/test';

export type VCursorOptions = {
  steps?: number;
  delayMs?: number;
  label?: string;
  showCursor?: boolean;
};

type Pos = { x: number; y: number };

const DEFAULT_STEPS = 25;
const DEFAULT_DELAY_MS = 32;

function isLocator(v: unknown): v is Locator {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Locator).boundingBox === 'function' &&
    typeof (v as Locator).evaluate === 'function'
  );
}

type VCursorGlobalShape = {
  x: number;
  y: number;
  active: boolean;
  label?: string;
  visible: boolean;
  set: (next: Partial<VCursorGlobalShape>) => void;
  get: () => VCursorGlobalShape;
};

/**
 * Virtual cursor helper – drives page.mouse with visual overlay sync.
 * Mirrors the brief spec exactly:
 * - moveTo / click / dblclick / hover / drag / type / wheel / press
 * - steps (default 25) + delayMs (default 32) visual trail
 * - showCursor false => native actions only (CI headless acceleration)
 * - boundingBox null fallback via evaluate + locator.click()
 * - injection via page.evaluate + page.addInitScript for window.__VCURSOR__
 */
export class VCursorHelper {
  private lastPos: Pos | null = null;
  private initScriptInstalled = false;

  constructor(
    private readonly page: Page,
    private readonly opts: VCursorOptions = {},
  ) {}

  private merged(opts?: VCursorOptions): Required<Pick<VCursorOptions, 'steps' | 'delayMs'>> &
    VCursorOptions {
    const baseSteps = this.opts.steps ?? DEFAULT_STEPS;
    const baseDelay = this.opts.delayMs ?? DEFAULT_DELAY_MS;
    const baseLabel = this.opts.label;
    const baseShow = this.opts.showCursor;
    return {
      steps: opts?.steps ?? baseSteps,
      delayMs: opts?.delayMs ?? baseDelay,
      label: opts?.label ?? baseLabel,
      showCursor: opts?.showCursor ?? baseShow,
    };
  }

  private async ensureCursorInjected(): Promise<void> {
    const show = this.opts.showCursor ?? true;
    // per-call showCursor override is handled by caller; here we just ensure global if overall enabled
    // If instance opts explicitly false and no per-call override, skip. Caller checks merged.showCursor.
    // We keep this check permissive – evaluate is cheap.
    if (show === false) return;

    await this.page.evaluate(() => {
      const w = window as unknown as { __VCURSOR__?: VCursorGlobalShape };
      if (!w.__VCURSOR__) {
        let current: VCursorGlobalShape = {
          x: 0,
          y: 0,
          active: false,
          label: undefined,
          visible: true,
          set(next: Partial<VCursorGlobalShape>) {
            Object.assign(current, next);
            Object.assign(w.__VCURSOR__ as object, current);
            window.dispatchEvent(new CustomEvent('__vcursor:update', { detail: next }));
          },
          get() {
            return { ...current };
          },
        };
        // attach accessor sync so React overlay reading g.x works
        w.__VCURSOR__ = current;
        // ensure set dispatches event – already does
      }
    });

    // Fallback DOM overlay when React VCursorOverlay not mounted (no ?vcursor=1)
    await this.page.evaluate(() => {
      if (document.querySelector('[data-vcursor-root]')) return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('vcursor') === '1') return;
      const w = window as unknown as { __VCURSOR__?: VCursorGlobalShape };
      if (!w.__VCURSOR__) return;
      const root = document.createElement('div');
      root.setAttribute('data-vcursor-root', '');
      root.setAttribute('data-testid', 'vcursor');
      root.setAttribute('data-vcursor', 'true');
      root.style.cssText =
        'position:fixed;left:0;top:0;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);transition:transform 80ms linear;display:flex;align-items:center;gap:6px;';
      root.innerHTML =
        '<div data-vcursor-dot data-testid="vcursor-dot" style="width:22px;height:22px;border-radius:9999px;border:2px solid #6366f1;background:rgba(255,255,255,0.92);box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 80ms linear,background 80ms linear,box-shadow 80ms linear;display:flex;align-items:center;justify-content:center;"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true" style="transform:translate(1px,0.5px)"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#18181b" stroke="white" stroke-width="0.7" stroke-linejoin="round"/></svg></div><span data-vcursor-label data-testid="vcursor-label" style="margin-left:2px;padding:2px 6px;font-size:11px;font-weight:600;background:#18181b;color:#fff;border-radius:4px;white-space:nowrap;border:1px solid rgba(255,255,255,0.1);box-shadow:0 2px 8px rgba(0,0,0,0.2);display:none;"></span>';
      document.body.appendChild(root);
      const dot = root.querySelector('[data-vcursor-dot]') as HTMLElement | null;
      const labelEl = root.querySelector('[data-vcursor-label]') as HTMLElement | null;
      const svgPath = root.querySelector('path') as SVGPathElement | null;
      const update = (detail: Partial<VCursorGlobalShape>): void => {
        if (detail.x !== undefined) root.style.left = `${detail.x}px`;
        if (detail.y !== undefined) root.style.top = `${detail.y}px`;
        if (detail.active !== undefined && dot) {
          if (detail.active) {
            dot.style.transform = 'scale(1.12)';
            dot.style.background = 'rgba(99,102,241,0.32)';
            dot.style.boxShadow = '0 0 0 6px rgba(99,102,241,0.22), 0 4px 12px rgba(0,0,0,0.16)';
            if (svgPath) svgPath.setAttribute('fill', '#4f46e5');
          } else {
            dot.style.transform = 'scale(1)';
            dot.style.background = 'rgba(255,255,255,0.92)';
            dot.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            if (svgPath) svgPath.setAttribute('fill', '#18181b');
          }
        }
        if (detail.label !== undefined && labelEl) {
          if (detail.label) {
            labelEl.textContent = detail.label;
            labelEl.style.display = 'inline';
          } else {
            labelEl.style.display = 'none';
            labelEl.textContent = '';
          }
        }
        if (detail.visible !== undefined) {
          root.style.display = detail.visible ? 'flex' : 'none';
        }
      };
      window.addEventListener('__vcursor:update', (e: Event) => {
        const d = (e as CustomEvent<Partial<VCursorGlobalShape>>).detail;
        if (d) update(d);
      });
      const g = w.__VCURSOR__!;
      const origSet = g.set.bind(g);
      g.set = (next: Partial<VCursorGlobalShape>) => {
        origSet(next);
        update(next);
      };
      update({ x: g.x, y: g.y, active: g.active, label: g.label, visible: g.visible });
    });

    if (!this.initScriptInstalled) {
      try {
        await this.page.addInitScript(() => {
          const w = window as unknown as { __VCURSOR__?: VCursorGlobalShape };
          if (!w.__VCURSOR__) {
            let current: VCursorGlobalShape = {
              x: 0,
              y: 0,
              active: false,
              label: undefined,
              visible: true,
              set(next: Partial<VCursorGlobalShape>) {
                Object.assign(current, next);
                Object.assign(w.__VCURSOR__ as object, current);
                window.dispatchEvent(new CustomEvent('__vcursor:update', { detail: next }));
              },
              get() {
                return { ...current };
              },
            };
            w.__VCURSOR__ = current;
          }
        });
        this.initScriptInstalled = true;
      } catch {
        // page may be closed – ignore
      }
    }
  }

  private async resolveLocatorCenter(locator: Locator): Promise<Pos | null> {
    const box = await locator.boundingBox();
    if (box) {
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    // Fallback: getBoundingClientRect via evaluate
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      const rect = await locator.evaluate((el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      });
      if (rect && rect.w > 0 && rect.h > 0) {
        return { x: rect.x, y: rect.y };
      }
    } catch {
      // fall through
    }
    return null;
  }

  private async syncVisual(next: Partial<VCursorGlobalShape>): Promise<void> {
    try {
      await this.page.evaluate((detail: Partial<VCursorGlobalShape>) => {
        const w = window as unknown as { __VCURSOR__?: VCursorGlobalShape };
        if (w.__VCURSOR__?.set) w.__VCURSOR__.set(detail);
        else if (w.__VCURSOR__) Object.assign(w.__VCURSOR__, detail);
        window.dispatchEvent(new CustomEvent('__vcursor:update', { detail }));
      }, next as unknown as Record<string, unknown>);
    } catch {
      // ignore if page closed / navigation
    }
  }

  async moveTo(
    locatorOrPos: Locator | Pos,
    opts?: VCursorOptions,
  ): Promise<Pos> {
    const m = this.merged(opts);
    const steps = m.steps;
    const delayMs = m.delayMs;
    const showCursor = m.showCursor ?? true;
    const label = m.label;

    let dest: Pos | null = null;
    let fallbackClickNeeded = false;

    if (isLocator(locatorOrPos)) {
      dest = await this.resolveLocatorCenter(locatorOrPos);
      if (!dest) {
        // boundingBox null fallback – try direct click as spec says
        // For moveTo we return sentinel and let caller decide; but we also attempt fallback click here
        // To avoid double-click in click(), we mark fallback and still do native move if possible
        fallbackClickNeeded = true;
        // try to get any position via evaluate even if zero size – otherwise sentinel
        try {
          const r = await locatorOrPos.evaluate((el: Element) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          });
          if (r) dest = { x: r.x, y: r.y };
        } catch {
          dest = null;
        }
        if (!dest) {
          // absolute fallback: direct locator click
          try {
            await locatorOrPos.click({ timeout: 3000 });
          } catch {
            // ignore
          }
          return { x: 0, y: 0 };
        }
      }
      // if fallbackClickNeeded but we resolved dest, we still perform visual move then caller will click
      void fallbackClickNeeded;
    } else {
      dest = locatorOrPos;
    }

    if (!dest) return { x: 0, y: 0 };

    if (!showCursor) {
      await this.page.mouse.move(dest.x, dest.y, { steps });
      this.lastPos = dest;
      return dest;
    }

    await this.ensureCursorInjected();

    const start = this.lastPos;

    if (start) {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = start.x + (dest.x - start.x) * t;
        const y = start.y + (dest.y - start.y) * t;
        await this.page.mouse.move(x, y);
        await this.syncVisual({ x, y, label, active: false, visible: true });
        if (delayMs > 0) await this.page.waitForTimeout(delayMs);
      }
    } else {
      // First move – no interpolation, single move with visual sync
      await this.page.mouse.move(dest.x, dest.y, { steps });
      await this.syncVisual({ x: dest.x, y: dest.y, label, active: false, visible: true });
      if (delayMs > 0) await this.page.waitForTimeout(delayMs);
    }

    this.lastPos = dest;
    return dest;
  }

  async click(locator: Locator, opts?: VCursorOptions): Promise<void> {
    const m = this.merged(opts);
    const showCursor = m.showCursor ?? true;
    const label = m.label ?? 'click';

    const pos = await this.moveTo(locator, { ...opts, label });
    // If moveTo fallback already clicked (pos 0,0 sentinel), skip mouse down/up
    const isSentinel = pos.x === 0 && pos.y === 0;
    if (isSentinel) {
      // moveTo already performed locator.click fallback – just ensure visual reset
      if (showCursor) await this.syncVisual({ active: false, label: undefined });
      return;
    }

    if (showCursor) await this.syncVisual({ active: true, label });

    try {
      await this.page.mouse.down();
      await this.page.waitForTimeout(50);
      await this.page.mouse.up();
    } catch {
      // fallback to locator click if mouse fails (e.g., element detached)
      try {
        await locator.click({ timeout: 3000 });
      } catch {
        // ignore
      }
    }

    if (showCursor) {
      await this.syncVisual({ active: false, label: undefined });
      await this.page.waitForTimeout(40);
      // keep lastPos at click location
      this.lastPos = pos;
    }
  }

  async dblclick(locator: Locator, opts?: VCursorOptions): Promise<void> {
    const m = this.merged(opts);
    const showCursor = m.showCursor ?? true;
    const label = m.label ?? 'dblclick';

    const pos = await this.moveTo(locator, { ...opts, label });
    const isSentinel = pos.x === 0 && pos.y === 0;
    if (isSentinel) {
      try {
        await locator.dblclick({ timeout: 3000 });
      } catch {
        // ignore
      }
      if (showCursor) await this.syncVisual({ active: false });
      return;
    }

    if (!showCursor) {
      try {
        await locator.dblclick({ timeout: 3000 });
      } catch {
        await this.page.mouse.down();
        await this.page.mouse.up();
        await this.page.waitForTimeout(40);
        await this.page.mouse.down();
        await this.page.mouse.up();
      }
      return;
    }

    await this.syncVisual({ active: true, label });
    try {
      await this.page.mouse.down();
      await this.page.mouse.up();
      await this.page.waitForTimeout(60);
      await this.page.mouse.down();
      await this.page.mouse.up();
    } catch {
      try {
        await locator.dblclick({ timeout: 3000 });
      } catch {
        // ignore
      }
    }
    await this.syncVisual({ active: false, label: undefined });
    await this.page.waitForTimeout(40);
  }

  async hover(locator: Locator, opts?: VCursorOptions): Promise<void> {
    const m = this.merged(opts);
    const label = m.label ?? 'hover';
    await this.moveTo(locator, { ...opts, label });
    // hover is just move; keep active false
    const showCursor = m.showCursor ?? true;
    if (showCursor) {
      await this.syncVisual({ active: false, label });
      await this.page.waitForTimeout(80);
      await this.syncVisual({ label: undefined });
    }
  }

  async drag(from: Locator, to: Locator, opts?: VCursorOptions): Promise<void> {
    const m = this.merged(opts);
    const showCursor = m.showCursor ?? true;
    const label = m.label ?? 'drag';

    const fromPos = await this.moveTo(from, { ...opts, label });
    const isSentinel = fromPos.x === 0 && fromPos.y === 0;
    const toPos = await this.resolveLocatorCenter(to);
    if (!toPos) {
      // fallback: try direct drag via locator.dragTo
      try {
        await from.dragTo(to);
      } catch {
        // ignore
      }
      if (showCursor) await this.syncVisual({ active: false, label: undefined });
      return;
    }

    if (isSentinel && !showCursor) {
      try {
        await from.dragTo(to);
      } catch {
        // ignore
      }
      return;
    }

    if (showCursor) await this.syncVisual({ active: true, label });

    try {
      await this.page.mouse.down();
      await this.page.waitForTimeout(60);
    } catch {
      // fallback
      try {
        await from.dragTo(to);
      } catch {
        // ignore
      }
      if (showCursor) await this.syncVisual({ active: false, label: undefined });
      return;
    }

    const steps = m.steps;
    const delayMs = m.delayMs;
    const start = fromPos;

    if (showCursor) {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = start.x + (toPos.x - start.x) * t;
        const y = start.y + (toPos.y - start.y) * t;
        await this.page.mouse.move(x, y);
        await this.syncVisual({ x, y, active: true, label, visible: true });
        if (delayMs > 0) await this.page.waitForTimeout(delayMs);
      }
    } else {
      await this.page.mouse.move(toPos.x, toPos.y, { steps });
    }

    try {
      await this.page.mouse.up();
    } catch {
      // ignore
    }

    if (showCursor) {
      await this.syncVisual({ active: false, label: undefined });
      await this.page.waitForTimeout(40);
    }
    this.lastPos = toPos;
  }

  async type(
    locator: Locator,
    text: string,
    opts?: VCursorOptions & { delay?: number },
  ): Promise<void> {
    const m = this.merged(opts);
    const showCursor = m.showCursor ?? true;
    const delay = (opts as { delay?: number } | undefined)?.delay ?? 32;
    const label = m.label ?? 'type';

    await this.click(locator, { ...opts, label });

    // Ensure focused
    try {
      await locator.focus({ timeout: 2000 });
    } catch {
      // ignore
    }

    if (showCursor) await this.syncVisual({ active: true, label: `type` });

    try {
      await locator.pressSequentially(text, { delay });
    } catch {
      // fallback to fill
      try {
        await locator.fill(text);
      } catch {
        // last resort: keyboard type
        await this.page.keyboard.type(text, { delay });
      }
    }

    if (showCursor) {
      await this.syncVisual({ active: false, label: undefined });
      // subtle cursor bounce after typing
      const cur = this.lastPos;
      if (cur) {
        await this.syncVisual({ x: cur.x, y: cur.y, active: false });
      }
    }
  }

  async wheel(deltaY: number, opts?: VCursorOptions): Promise<void> {
    const m = this.merged(opts);
    const showCursor = m.showCursor ?? true;
    if (showCursor) {
      await this.ensureCursorInjected();
      if (m.label) await this.syncVisual({ label: m.label });
    }
    await this.page.mouse.wheel(0, deltaY);
    if (m.delayMs && m.delayMs > 0) await this.page.waitForTimeout(Math.min(m.delayMs, 100));
    if (showCursor && m.label) {
      await this.page.waitForTimeout(120);
      await this.syncVisual({ label: undefined });
    }
  }

  async press(key: string, opts?: VCursorOptions): Promise<void> {
    const m = this.merged(opts);
    if (m.showCursor && m.label) await this.syncVisual({ label: m.label });
    await this.page.keyboard.press(key);
    if (m.showCursor && m.label) {
      await this.page.waitForTimeout(80);
      await this.syncVisual({ label: undefined });
    }
  }
}

export function vCursor(page: Page, opts?: VCursorOptions): VCursorHelper {
  // Auto-disable visual in CI headless if env indicates, unless explicitly requested
  // This keeps local headed visual but accelerates CI when showCursor not set.
  // We respect explicit showCursor in opts; otherwise default true.
  // Caller can pass { showCursor: false } or rely on CI check below via factory wrapper.
  // We keep simple: if process.env.CI and opts?.showCursor not set, we could default false,
  // but spec says showCursor false is for CI acceleration – we leave default true so headed smoke still visual.
  // To honor spec "CI时 showCursor:false加速", test code can pass showCursor: !!process.env.CI ? false : true
  return new VCursorHelper(page, opts);
}

// ---------------------------------------------------------------------------
// Optional PageObject base – for specs reuse (Task 3 Step 4)
// ---------------------------------------------------------------------------

export class AppPage {
  public cursor: VCursorHelper;

  constructor(
    public page: Page,
    cursor?: VCursorHelper,
  ) {
    this.cursor = cursor ?? vCursor(page);
  }

  gotoFlowspec(url: string): Promise<null | import('@playwright/test').Response> {
    return this.page.goto(url);
  }

  get canvas(): Locator {
    return this.page.locator('.react-flow, [data-testid="flow-canvas"]');
  }

  get nodeDetail(): Locator {
    return this.page.locator('[data-testid="node-detail"]');
  }
}
