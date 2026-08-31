import { Chip } from '@heroui/react';
import type { FlowListEntry } from '../hooks/useFlowList.js';

/**
 * Edge侧栏风格的多标签切换 — 横向 Tabs + 纵向列表双形态，
 * 样式类似 EdgeDetail 侧栏 Card/Chip，复用 indigo active 高亮与数量徽标。
 * LeftNav 内部可直接使用本组件覆盖列表渲染，保持样式一致。
 */
export function FlowTabs(props: {
  flowList: FlowListEntry[];
  activeId: string;
  dir: string;
  collapsed: boolean;
  onSwitch: (id: string) => void;
}): React.JSX.Element {
  const { flowList, activeId, dir, collapsed, onSwitch } = props;
  if (collapsed) {
    return (
      <div data-testid="flow-list" className="flex flex-col gap-1.5 p-1.5">
        {flowList.map((f) => {
          const active = f.id === activeId;
          return (
            <button
              key={f.id}
              data-testid="flow-list-item"
              data-flow-id={f.id}
              data-active={active ? 'true' : 'false'}
              onClick={() => onSwitch(f.id)}
              title={`${f.title} (${f.id})`}
              className={`w-full rounded-lg px-2 py-2 text-[11px] font-medium border text-center transition-colors ${active ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30' : 'bg-white border-default-200 dark:bg-zinc-800'}`}
            >
              {f.id.slice(0, 2)}
            </button>
          );
        })}
        <div className="text-[10px] text-default-400 text-center mt-1">{flowList.length}</div>
      </div>
    );
  }
  return (
    <div data-testid="flow-list" className="flex flex-col gap-1.5 p-1.5">
      <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-default-500">
        <span className="truncate flex-1">{dir}</span>
        <Chip size="sm" variant="soft">
          {flowList.length}
        </Chip>
      </div>
      {flowList.length === 0 ? (
        <div className="text-xs text-default-400 text-center py-6">
          暂无 flowspec
          <br />
          `flow add` 后刷新
        </div>
      ) : (
        flowList.map((f) => {
          const active = f.id === activeId;
          return (
            <button
              key={f.id}
              data-testid="flow-list-item"
              data-flow-id={f.id}
              data-active={active ? 'true' : 'false'}
              onClick={() => onSwitch(f.id)}
              title={`${f.title} (${f.id}) · ${f.path}`}
              className={`w-full text-left rounded-lg px-2.5 py-2 text-xs leading-4 border transition-colors ${active ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700' : 'bg-white border-default-200 hover:border-default-300 dark:bg-zinc-800'}`}
            >
              <div className="font-medium truncate flex items-center gap-1.5">
                <span className="truncate">{f.title}</span>
                {active ? (
                  <Chip size="sm" color="accent" variant="soft" className="shrink-0">
                    当前
                  </Chip>
                ) : null}
              </div>
              <div className="text-[11px] opacity-60 truncate">{f.id}</div>
            </button>
          );
        })
      )}
    </div>
  );
}
