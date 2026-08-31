import * as React from 'react';

export type VCursorProps = {
  x: number;
  y: number;
  active?: boolean;
  label?: string;
  visible?: boolean;
};

export type VCursorState = {
  x: number;
  y: number;
  active: boolean;
  label?: string;
  visible: boolean;
};

export type VCursorGlobal = VCursorState & {
  set: (next: Partial<VCursorState>) => void;
  get: () => VCursorState;
};

declare global {
  interface Window {
    __VCURSOR__?: VCursorGlobal;
  }
}

/**
 * Pure presentational cursor overlay.
 * - Fixed positioning, pointer-events none, z 9999
 * - Follows x,y with translate(-50%,-50%)
 * - Active state scales / glows, label shows operation name
 * - Dark/light compatible (opaque dot + dark label), mix-blend-mode optional
 * - transition: transform 80ms linear
 */
export function VCursor({
  x,
  y,
  active,
  label,
  visible = true,
}: VCursorProps): React.JSX.Element | null {
  if (visible === false) return null;
  return (
    <div
      data-testid="vcursor"
      data-vcursor="true"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-50%, -50%)',
        transition: 'transform 80ms linear',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        data-testid="vcursor-dot"
        style={{
          width: 22,
          height: 22,
          borderRadius: 9999,
          border: '2px solid #6366f1',
          background: active ? 'rgba(99, 102, 241, 0.32)' : 'rgba(255, 255, 255, 0.92)',
          boxShadow: active
            ? '0 0 0 6px rgba(99, 102, 241, 0.22), 0 4px 12px rgba(0,0,0,0.16)'
            : '0 4px 12px rgba(0,0,0,0.15)',
          transform: active ? 'scale(1.12)' : 'scale(1)',
          transition: 'transform 80ms linear, background 80ms linear, box-shadow 80ms linear',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{ transform: 'translate(1px, 0.5px)' }}
        >
          <path
            d="M1 1 L11 6 L1 11 L3.5 6 Z"
            fill={active ? '#4f46e5' : '#18181b'}
            stroke="white"
            strokeWidth="0.7"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {label ? (
        <span
          data-testid="vcursor-label"
          style={{
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1,
            background: '#18181b',
            color: '#fff',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            whiteSpace: 'nowrap',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Overlay that subscribes to window.__VCURSOR__ global.
 * Used by apps/web when ?vcursor=1 – driven by e2e/helpers/v-cursor.ts via page.evaluate.
 */
export function VCursorOverlay(): React.JSX.Element | null {
  const [state, setState] = React.useState<VCursorState>(() => {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __VCURSOR__?: VCursorGlobal };
      if (w.__VCURSOR__) {
        const g = w.__VCURSOR__;
        return { x: g.x, y: g.y, active: g.active, label: g.label, visible: g.visible };
      }
    }
    return { x: -100, y: -100, active: false, label: undefined, visible: true };
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __VCURSOR__?: VCursorGlobal & { __listeners?: Set<(s: VCursorState) => void> } };

    // Ensure global exists if helper hasn't injected yet
    if (!w.__VCURSOR__) {
      let current: VCursorState = { x: -100, y: -100, active: false, label: undefined, visible: true };
      const listeners = new Set<(s: VCursorState) => void>();
      const g = {
        get x() {
          return current.x;
        },
        set x(v: number) {
          current.x = v;
        },
        get y() {
          return current.y;
        },
        set y(v: number) {
          current.y = v;
        },
        get active() {
          return current.active;
        },
        set active(v: boolean) {
          current.active = v;
        },
        get label() {
          return current.label;
        },
        set label(v: string | undefined) {
          current.label = v;
        },
        get visible() {
          return current.visible;
        },
        set visible(v: boolean) {
          current.visible = v;
        },
        set(next: Partial<VCursorState>) {
          current = { ...current, ...next };
          // sync accessor props
          (g as unknown as Record<string, unknown>).x = current.x;
          (g as unknown as Record<string, unknown>).y = current.y;
          Object.assign(g, current);
          for (const fn of listeners) fn(current);
          window.dispatchEvent(new CustomEvent('__vcursor:update', { detail: next }));
        },
        get() {
          return { ...current };
        },
      } as unknown as VCursorGlobal & { __listeners?: Set<(s: VCursorState) => void> };
      (g as unknown as { __listeners?: Set<(s: VCursorState) => void> }).__listeners = listeners;
      w.__VCURSOR__ = g;
      // expose listeners for helper patching
    }

    const g = w.__VCURSOR__!;
    const listeners = (g as unknown as { __listeners?: Set<(s: VCursorState) => void> }).__listeners;

    const onUpdate = (e: Event): void => {
      const detail = (e as CustomEvent<Partial<VCursorState>>).detail;
      if (detail) setState((prev) => ({ ...prev, ...detail }));
    };

    let unsub: (() => void) | undefined;
    if (listeners) {
      const fn = (s: VCursorState): void => setState(s);
      listeners.add(fn);
      unsub = (): void => {
        listeners.delete(fn);
      };
      // sync initial
      setState({ x: g.x, y: g.y, active: g.active, label: g.label, visible: g.visible });
    }

    window.addEventListener('__vcursor:update', onUpdate);

    // Patch global set to ensure event + state sync even if helper overwrote set earlier
    const originalSet = g.set.bind(g);
    const wrapped = (next: Partial<VCursorState>): void => {
      originalSet(next);
      // ensure overlay updates even if originalSet didn't dispatch (defensive)
      setState((prev) => ({ ...prev, ...next }));
    };
    const alreadyWrapped = (g.set as unknown as { __wrapped?: boolean }).__wrapped;
    if (!alreadyWrapped) {
      (wrapped as unknown as { __wrapped?: boolean }).__wrapped = true;
      g.set = wrapped;
    }

    return () => {
      window.removeEventListener('__vcursor:update', onUpdate);
      if (unsub) unsub();
      // restore original if we wrapped – keep original for future navigations (no need)
    };
  }, []);

  return <VCursor x={state.x} y={state.y} active={state.active} label={state.label} visible={state.visible} />;
}

// ---------------------------------------------------------------------------
// Provider + hook (optional, for apps/web global mount)
// ---------------------------------------------------------------------------

type VCursorContextValue = {
  state: VCursorState;
  setState: (next: Partial<VCursorState>) => void;
};

const VCursorContext = React.createContext<VCursorContextValue | null>(null);

export function VCursorProvider({
  children,
}: {
  children?: React.ReactNode;
}): React.JSX.Element {
  const [state, setStateRaw] = React.useState<VCursorState>({
    x: -100,
    y: -100,
    active: false,
    label: undefined,
    visible: true,
  });

  const setState = React.useCallback((next: Partial<VCursorState>) => {
    setStateRaw((prev) => ({ ...prev, ...next }));
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __VCURSOR__?: VCursorGlobal };
      w.__VCURSOR__?.set(next);
      // also dispatch for overlay listeners
      window.dispatchEvent(new CustomEvent('__vcursor:update', { detail: next }));
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<Partial<VCursorState>>).detail;
      if (detail) setStateRaw((prev) => ({ ...prev, ...detail }));
    };
    window.addEventListener('__vcursor:update', handler);
    return () => window.removeEventListener('__vcursor:update', handler);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __VCURSOR__?: VCursorGlobal };
    if (!w.__VCURSOR__) {
      let current = { ...state };
      w.__VCURSOR__ = {
        ...current,
        set(next: Partial<VCursorState>) {
          current = { ...current, ...next };
          Object.assign(w.__VCURSOR__!, current);
          window.dispatchEvent(new CustomEvent('__vcursor:update', { detail: next }));
          setStateRaw((prev) => ({ ...prev, ...next }));
        },
        get() {
          return { ...current };
        },
      } as VCursorGlobal;
    }
    // keep global in sync with local state on mount
    w.__VCURSOR__!.x = state.x;
    w.__VCURSOR__!.y = state.y;
    w.__VCURSOR__!.active = state.active;
    w.__VCURSOR__!.label = state.label;
    w.__VCURSOR__!.visible = state.visible;
  }, [state]);

  return (
    <VCursorContext.Provider value={{ state, setState }}>
      <VCursor x={state.x} y={state.y} active={state.active} label={state.label} visible={state.visible} />
      {children}
    </VCursorContext.Provider>
  );
}

export function useVCursor(): VCursorContextValue {
  const ctx = React.useContext(VCursorContext);
  if (!ctx) throw new Error('useVCursor must be used within VCursorProvider');
  return ctx;
}
