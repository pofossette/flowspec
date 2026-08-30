import * as React from 'react';
import { Button } from '@heroui/react';
import type { FlowSpec } from '@flowspec/domain';
import type { PreviewSelection } from '../store/preview-store.js';
import { DocNav } from './DocNav.js';
import { NodeDetail } from './NodeDetail.js';
import { EdgeDetail } from './EdgeDetail.js';

export function FlowAside(props: {
  draft: FlowSpec;
  selection: PreviewSelection;
  readOnly: boolean;
  onClearSelection: () => void;
  onUpdateNode: (
    p: Partial<{ label: string; content: string; kind: string; status: string }>,
  ) => void;
  onUpdateEdge: (p: Partial<{ label: string; content: string; kind: string }>) => void;
}): React.JSX.Element {
  const { draft, selection, readOnly, onClearSelection, onUpdateNode, onUpdateEdge } = props;
  const selectedNode =
    selection?.type === 'node' ? (draft.nodes.find((n) => n.id === selection.id) ?? null) : null;
  const selectedEdge =
    selection?.type === 'edge' ? (draft.edges.find((e) => e.id === selection.id) ?? null) : null;

  const [width, setWidth] = React.useState(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('flow-aside-width') : null;
    const n = saved ? Number(saved) : 380;
    return Number.isFinite(n) ? Math.min(720, Math.max(280, n)) : 380;
  });
  const draggingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startWRef = React.useRef(0);
  const lastWidthRef = React.useRef(width);
  React.useEffect(() => {
    lastWidthRef.current = width;
  }, [width]);

  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      draggingRef.current = true;
      startXRef.current = e.clientX;
      startWRef.current = width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const dx = startXRef.current - ev.clientX;
        const next = Math.min(720, Math.max(280, startWRef.current + dx));
        setWidth(next);
        lastWidthRef.current = next;
      };
      const onUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        try {
          window.localStorage.setItem('flow-aside-width', String(lastWidthRef.current));
        } catch {}
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [width],
  );

  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden border-l border-panel-line bg-panel-surface"
      style={{ width }}
    >
      {/* left drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-0 cursor-col-resize touch-none hover:bg-panel-accent/15 active:bg-panel-accent/25"
        onMouseDown={onMouseDown}
        title="拖拽调整侧栏宽度"
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-panel-line/70" />
      </div>
      <div className="flex items-center justify-between border-b border-default-200 px-4 py-3">
        <span className="text-sm font-semibold">
          {selection
            ? selection.type === 'node'
              ? '节点详情 · 目标状态'
              : '连线详情 · 实现方案'
            : '详情'}
        </span>
        {selection ? (
          <Button size="sm" variant="tertiary" onPress={onClearSelection}>
            清除选中
          </Button>
        ) : null}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {!selection ? (
          <DocNav draft={draft} readOnly={readOnly} />
        ) : selection.type === 'node' && selectedNode ? (
          <NodeDetail
            draft={draft}
            node={selectedNode}
            readOnly={readOnly}
            onUpdate={onUpdateNode}
          />
        ) : selection.type === 'edge' && selectedEdge ? (
          <EdgeDetail
            draft={draft}
            edge={selectedEdge}
            readOnly={readOnly}
            onUpdate={onUpdateEdge}
          />
        ) : (
          <div className="text-sm text-default-500">选中不存在</div>
        )}
      </div>
    </aside>
  );
}
