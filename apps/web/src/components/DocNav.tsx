import type { FlowSpec } from '@flowspec/domain';
import { Card, Chip } from '@heroui/react';
import { usePreviewStore } from '../store/preview-store.js';

export function DocNav(props: { draft: FlowSpec; readOnly: boolean }): React.JSX.Element {
  const { draft, readOnly } = props;
  const setSelection = usePreviewStore((s) => s.setSelection);
  return (
    <div className="space-y-4 text-sm leading-6 text-default-500">
      <div className="font-semibold text-foreground">文档导航 · 点击即阅读原文</div>
      <div className="grid gap-1.5 max-h-[45vh] overflow-auto pr-1">
        {draft.nodes.map((n) => (
          <button
            key={n.id}
            onClick={() => setSelection({ type: 'node', id: n.id })}
            className="text-left rounded-md border border-default-200 hover:border-default-300 bg-white px-2.5 py-2 text-xs leading-4 dark:bg-zinc-800"
          >
            <div className="font-medium text-foreground truncate">
              {n.label}
              <span className="ml-1.5 text-[10px] text-default-400">{n.kind}</span>
            </div>
            {n.content ? (
              <div className="line-clamp-2 opacity-70 whitespace-pre-wrap mt-1">
                {n.content.slice(0, 80)}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      <Card className="p-4 bg-default-50 shadow-none border border-default-200">
        <div className="font-semibold text-foreground text-xs mb-1">{draft.title}</div>
        <div className="text-xs opacity-80 line-clamp-3">{draft.description ?? '—'}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="sm" color="accent" variant="soft">
            {draft.nodes.length} 章节
          </Chip>
          <Chip size="sm" color="success" variant="soft">
            {draft.edges.length} 关联
          </Chip>
          <Chip size="sm" variant="soft">
            {draft.rootId} 根
          </Chip>
        </div>
      </Card>

      {readOnly ? (
        <Card className="p-3 bg-warning/10 border border-warning/20 text-xs">
          已锁定，仅预览 · 选中仍可查看详细内容
        </Card>
      ) : null}
    </div>
  );
}
