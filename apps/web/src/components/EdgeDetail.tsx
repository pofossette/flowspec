import * as React from 'react';
import { Button, Card, Chip, Modal, TextField, Label, Input } from '@heroui/react';
import type { FlowSpec } from '@flowspec/core';
import { useThemeStore, useEffectiveTheme } from '../store/theme-store.js';
import { BlockMarkdownEditor } from './BlockMarkdownEditor.js';

const EDGE_KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  hierarchical: { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569' },
  sequence: { bg: '#0f172a', border: '#0f172a', text: '#ffffff' },
  dependency: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
  async: { bg: '#f0f9ff', border: '#0ea5e9', text: '#0369a1' },
  reference: { bg: '#f9fafb', border: '#9ca3af', text: '#6b7280' },
  causal: { bg: '#f5f3ff', border: '#7c3aed', text: '#5b21b6' },
  feedback: { bg: '#f0fdfa', border: '#14b8a6', text: '#0f766e' },
  blocked: { bg: '#ffe4e6', border: '#e11d48', text: '#9f1239' },
};

export function EdgeDetail(props: {
  draft: FlowSpec;
  edge: FlowSpec['edges'][number];
  readOnly: boolean;
  onUpdate: (p: Partial<{ label: string; content: string; kind: string }>) => void;
}): React.JSX.Element {
  const { edge, draft, readOnly, onUpdate } = props;
  const { mode } = useThemeStore();
  const effectiveTheme = useEffectiveTheme(mode);
  const source = draft.nodes.find((n) => n.id === edge.source);
  const target = draft.nodes.find((n) => n.id === edge.target);
  const [label, setLabel] = React.useState(edge.label ?? '');
  const [content, setContent] = React.useState(edge.content ?? '');
  React.useEffect(() => {
    setLabel(edge.label ?? '');
    setContent(edge.content ?? '');
  }, [edge.id, edge.label, edge.content]);
  const dirty = label !== (edge.label ?? '') || content !== (edge.content ?? '');
  React.useEffect(() => {
    if (readOnly || !dirty) return;
    const t = setTimeout(() => void onUpdate({ label, content }), 600);
    return () => clearTimeout(t);
  }, [label, content, dirty, readOnly, onUpdate]);
  const kindStyle = EDGE_KIND_COLORS[edge.kind] ?? EDGE_KIND_COLORS.hierarchical!;
  const [editorHeight, setEditorHeight] = React.useState(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('flow-doc-height') : null;
    const n = saved ? Number(saved) : 300;
    return Number.isFinite(n) ? Math.min(720, Math.max(180, n)) : 300;
  });
  const [fullscreen, setFullscreen] = React.useState(false);
  const onHeightMouseDown = React.useCallback((e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = editorHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      const next = Math.min(720, Math.max(180, startH + dy));
      setEditorHeight(next);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setEditorHeight((h) => {
        try {
          window.localStorage.setItem('flow-doc-height', String(h));
        } catch {}
        return h;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editorHeight]);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Chip
          size="sm"
          style={{ background: kindStyle.bg, color: kindStyle.text, borderColor: kindStyle.border }}
          variant="soft"
          className="border font-semibold"
        >
          {edge.kind}
        </Chip>
        <Chip size="sm" variant="soft">
          {edge.id}
        </Chip>
        {edge.directed ? (
          <Chip size="sm" color="accent" variant="soft">
            有向
          </Chip>
        ) : null}
      </div>

      <Card>
        <div className="p-3">
          <div className="text-sm font-semibold">
            {source?.label ?? edge.source} → {target?.label ?? edge.target}
          </div>
          <div className="text-xs text-muted mt-1">
            {edge.source} → {edge.target}
          </div>
        </div>
      </Card>

      <TextField isDisabled={readOnly} className="grid gap-1.5">
        <Label className="text-xs font-medium">实现方案标题（边标签）</Label>
        <Input
          value={label}
          onChange={(v) => {
            const toStr = (val: unknown): string => {
              if (typeof val === 'string') return val;
              // lib type gap: HeroUI Input onChange union string | ChangeEvent
              if (val !== null && typeof val === 'object' && 'target' in val)
                return String((val as { target: { value: unknown } }).target.value);
              return String(val);
            };
            setLabel(toStr(v));
          }}
          placeholder="一句话概括实现路径"
        />
      </TextField>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">详细实现方案（边 = 如何到达 · 块级编辑）</Label>
          <Button
            size="sm"
            variant="tertiary"
            className="h-6 px-2 text-xs"
            onPress={() => setFullscreen(true)}
            aria-label="全屏编辑"
          >
            ⛶ 全屏
          </Button>
        </div>
        <div
          className="relative flex flex-col rounded-lg border border-panel-line/60 bg-panel-surface dark:bg-zinc-900/30 overflow-hidden focus-within:border-default-300 focus-within:bg-white dark:focus-within:bg-zinc-900 transition-colors"
          style={{ height: editorHeight }}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <BlockMarkdownEditor
              key={`edge-${edge.id}`}
              value={content}
              onChange={readOnly ? undefined : (v) => setContent(v)}
              readOnly={readOnly}
              theme={effectiveTheme}
              placeholder="详述怎么做：步骤、依赖、接口、风险、回滚… 输入 / 唤起菜单"
            />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            className="h-1.5 shrink-0 cursor-row-resize touch-none border-t border-panel-line/40 bg-panel-elevated/60 hover:bg-panel-accent/15 active:bg-panel-accent/25"
            onMouseDown={onHeightMouseDown}
            title="拖拽调整编辑区高度"
          >
            <div className="pointer-events-none mx-auto mt-[3px] h-px w-8 bg-panel-line/60" />
          </div>
        </div>
      </div>

      {dirty && !readOnly ? (
        <div className="text-xs text-muted">已自动同步（WS 热更新）</div>
      ) : null}
      {readOnly ? <div className="text-xs text-muted">已锁定，仅预览</div> : null}

      <Modal isOpen={fullscreen} onOpenChange={(open) => !open && setFullscreen(false)}>
        <Modal.Backdrop>
          <Modal.Container size="full">
            <Modal.Dialog className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden border border-panel-line bg-panel-surface shadow-panel">
              <Modal.Header>
                <Modal.Heading className="text-sm font-semibold">全屏编辑 · {edge.label ?? edge.id}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="min-h-0 flex-1 overflow-auto p-4">
                <BlockMarkdownEditor
                  key={`edge-${edge.id}-fs`}
                  value={content}
                  onChange={readOnly ? undefined : (v) => setContent(v)}
                  readOnly={readOnly}
                  theme={effectiveTheme}
                  placeholder="全屏块级编辑 · / 唤起菜单"
                />
              </Modal.Body>
              <Modal.Footer className="justify-end">
                <Button size="sm" variant="tertiary" onPress={() => setFullscreen(false)}>
                  退出全屏
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
