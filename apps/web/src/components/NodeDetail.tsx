import type { FlowSpec } from '@flowspec/domain';
import {
  Button,
  Card,
  Chip,
  Description,
  Input,
  Label,
  Modal,
  Separator,
  TextField,
} from '@heroui/react';
import * as React from 'react';
import { useEffectiveTheme, useThemeStore } from '../store/theme-store.js';
import { BlockMarkdownEditor } from './BlockMarkdownEditor.js';

const NODE_KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  root: {
    bg: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    border: '#4f46e5',
    text: '#ffffff',
  },
  goal: { bg: '#eef2ff', border: '#6366f1', text: '#4338ca' },
  milestone: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  risk: { bg: '#ffe4e6', border: '#e11d48', text: '#9f1239' },
  insight: { bg: '#ccfbf1', border: '#0d9488', text: '#0f766e' },
  question: { bg: '#ede9fe', border: '#7c3aed', text: '#6d28d9' },
  task: { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
  branch: { bg: '#ffffff', border: '#cbd5e1', text: '#334155' },
  decision: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  note: { bg: '#fefce8', border: '#facc15', text: '#854d0e' },
  leaf: { bg: '#f8fafc', border: '#94a3b8', text: '#475569' },
};

export function NodeDetail(props: {
  draft: FlowSpec;
  node: FlowSpec['nodes'][number];
  readOnly: boolean;
  onUpdate: (p: Partial<{ label: string; content: string; kind: string; status: string }>) => void;
}): React.JSX.Element {
  const { node, draft, readOnly, onUpdate } = props;
  const { mode } = useThemeStore();
  const effectiveTheme = useEffectiveTheme(mode);
  const incoming = draft.edges.filter((e) => e.target === node.id);
  const outgoing = draft.edges.filter((e) => e.source === node.id);
  const [label, setLabel] = React.useState(node.label);
  const [content, setContent] = React.useState(node.content ?? '');
  React.useEffect(() => {
    setLabel(node.label);
    setContent(node.content ?? '');
  }, [node.label, node.content]);
  const dirty = label !== node.label || content !== (node.content ?? '');
  React.useEffect(() => {
    if (readOnly || !dirty) return;
    const t = setTimeout(() => void onUpdate({ label, content }), 600);
    return () => clearTimeout(t);
  }, [label, content, dirty, readOnly, onUpdate]);
  const kindStyle = NODE_KIND_COLORS[node.kind] ?? NODE_KIND_COLORS.branch!;
  const [editorHeight, setEditorHeight] = React.useState(() => {
    const saved =
      typeof window !== 'undefined' ? window.localStorage.getItem('flow-doc-height') : null;
    const n = saved ? Number(saved) : 300;
    return Number.isFinite(n) ? Math.min(720, Math.max(180, n)) : 300;
  });
  const [fullscreen, setFullscreen] = React.useState(false);
  const onHeightMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
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
    },
    [editorHeight]
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Chip
          size="sm"
          style={{ background: kindStyle.bg, color: kindStyle.text, borderColor: kindStyle.border }}
          variant="soft"
          className="border font-semibold"
        >
          {node.kind}
        </Chip>
        {node.status ? (
          <Chip size="sm" color="success" variant="soft">
            {node.status}
          </Chip>
        ) : null}
        <Chip size="sm" variant="soft">
          {node.id}
        </Chip>
        {node.id === draft.rootId ? (
          <Chip size="sm" color="warning" variant="soft">
            root
          </Chip>
        ) : null}
      </div>

      <TextField isDisabled={readOnly} className="grid gap-1.5">
        <Label className="text-xs font-medium">目标状态（节点标题）</Label>
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
          placeholder="这一节点达成时，系统处于什么状态？"
        />
        {!readOnly ? (
          <Description className="text-xs">
            节点 = 目标状态，尽量写 why/what；实现路径写在连线上
          </Description>
        ) : null}
      </TextField>

      <Card>
        <div className="p-3">
          <div className="text-xs font-semibold mb-2">关联</div>
          <div className="text-xs leading-6">
            入边 {incoming.length} · 出边 {outgoing.length}
          </div>
          <Separator className="my-2" />
          <div className="grid gap-2">
            {incoming.map((e) => (
              <Card key={e.id} className="p-2">
                <div className="text-xs">
                  {e.source} → {node.id} · {e.label ?? e.kind}
                </div>
                {e.content ? (
                  <div className="opacity-70 whitespace-pre-wrap mt-1 text-xs">{e.content}</div>
                ) : null}
              </Card>
            ))}
            {outgoing.map((e) => (
              <Card key={e.id} className="p-2">
                <div className="text-xs">
                  {node.id} → {e.target} · {e.label ?? e.kind}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">文档正文（飞书式块级编辑 · / 唤起菜单）</Label>
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
              key={`node-${node.id}`}
              value={content}
              onChange={readOnly ? undefined : (v) => setContent(v)}
              readOnly={readOnly}
              theme={effectiveTheme}
              placeholder="输入 / 唤起块菜单 · 直接书写，自动保存"
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
        <div className="text-xs text-muted">已自动同步（WS 热更新），无需手动保存</div>
      ) : null}
      {readOnly ? <div className="text-xs text-muted">已锁定，仅预览 · 上方为原文渲染</div> : null}

      <Modal isOpen={fullscreen} onOpenChange={(open) => !open && setFullscreen(false)}>
        <Modal.Backdrop>
          <Modal.Container size="full">
            <Modal.Dialog className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden border border-panel-line bg-panel-surface shadow-panel">
              <Modal.Header>
                <Modal.Heading className="text-sm font-semibold">
                  全屏编辑 · {node.label}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="min-h-0 flex-1 overflow-auto p-4">
                <BlockMarkdownEditor
                  key={`node-${node.id}-fs`}
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
