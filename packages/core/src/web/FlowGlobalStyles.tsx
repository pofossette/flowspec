import * as React from 'react';

export const FLOW_GLOBAL_CSS = [
  '@keyframes flow-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.15);opacity:0.85} }',
  '@keyframes dashflow{to{stroke-dashoffset:-20}} .flow-edge-animated{animation:dashflow 1.2s linear infinite}',
].join('\n');

let injected = false;

function injectOnce(css: string, id: string): void {
  if (typeof document === 'undefined') return;
  if (injected) return;
  if (document.getElementById(id)) {
    injected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
  injected = true;
}

export function FlowGlobalStyles(): React.JSX.Element | null {
  // SSR-safe: useEffect injects once; also render fallback style tag for SSR/non-DOM
  React.useEffect(() => {
    injectOnce(FLOW_GLOBAL_CSS, 'flow-animations');
  }, []);
  // Render singleton <style> only if not yet injected via DOM (SSR/first paint)
  // Use id so duplicate mounts don't duplicate CSS; effect guards subsequent injects.
  if (typeof document !== 'undefined' && document.getElementById('flow-animations')) return null;
  return <style id="flow-animations">{FLOW_GLOBAL_CSS}</style>;
}
