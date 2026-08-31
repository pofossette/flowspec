import { Button, Chip } from '@heroui/react';
import * as React from 'react';

export type WorkspaceEntry = { id: string; title: string; path: string; rootId: string };

export function WorkspaceModal(props: {
  open: boolean;
  onClose: () => void;
  dir: string;
  api: (p: string) => string;
  workspaceList: WorkspaceEntry[];
  fullList: WorkspaceEntry[];
  onRefresh: () => void;
}): React.JSX.Element | null {
  const { open, onClose, dir, api, workspaceList, fullList, onRefresh } = props;
  const [busy, setBusy] = React.useState<string | null>(null);

  if (!open) return null;

  const workspaceIds = new Set(workspaceList.map((e) => e.id));
  const outside = fullList.filter((e) => !workspaceIds.has(e.id));

  const handleAdd = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(api('/api/workspace/add'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, dir }),
      });
      if (!res.ok) throw new Error(await res.text());
      onRefresh();
    } catch (e) {
      console.error(e);
      alert(`移入失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(api('/api/workspace/remove'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, dir }),
      });
      if (!res.ok) throw new Error(await res.text());
      onRefresh();
    } catch (e) {
      console.error(e);
      alert(`移出失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex max-h-[80vh] w-[860px] max-w-[95vw] flex-col rounded-2xl border border-default-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-default-200 px-5 py-4">
          <div>
            <div className="font-semibold">工作区管理</div>
            <div className="text-xs text-default-500">{dir} · 左侧工作区 · 右侧全部（未入选）</div>
          </div>
          <Button size="sm" variant="tertiary" onPress={onClose}>
            关闭
          </Button>
        </div>
        <div className="grid flex-1 min-h-0 grid-cols-2 gap-0 overflow-hidden">
          <div className="flex min-h-0 flex-col border-r border-default-200">
            <div className="flex items-center gap-2 border-b border-default-200 bg-default-50 px-4 py-2 text-xs font-semibold">
              工作区{' '}
              <Chip size="sm" variant="soft">
                {workspaceList.length}
              </Chip>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1.5">
              {workspaceList.length === 0 ? (
                <div className="py-10 text-center text-sm text-default-400">暂无，点右侧移入</div>
              ) : (
                workspaceList.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-lg border border-default-200 bg-white px-2.5 py-2 text-xs dark:bg-zinc-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{e.title}</div>
                      <div className="truncate text-[11px] opacity-60">
                        {e.id} · {e.path}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="h-6 px-2 text-xs shrink-0"
                      onPress={() => void handleRemove(e.id)}
                      isDisabled={busy === e.id}
                    >
                      {busy === e.id ? '…' : '移出 →'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-default-200 bg-default-50 px-4 py-2 text-xs font-semibold">
              全部（未入选）{' '}
              <Chip size="sm" variant="soft">
                {outside.length}
              </Chip>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1.5">
              {outside.length === 0 ? (
                <div className="py-10 text-center text-sm text-default-400">全部已在工作区</div>
              ) : (
                outside.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-lg border border-default-200 bg-white px-2.5 py-2 text-xs dark:bg-zinc-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{e.title}</div>
                      <div className="truncate text-[11px] opacity-60">
                        {e.id} · {e.path}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-6 px-2 text-xs shrink-0"
                      onPress={() => void handleAdd(e.id)}
                      isDisabled={busy === e.id}
                    >
                      {busy === e.id ? '…' : '← 移入'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-default-200 px-4 py-2 text-[11px] text-default-500">
          点击移入/移出将更新 <code>.flowspec/workspace.json</code>，不删除文件；
          <code>full.json</code> 为全量扫描
        </div>
      </div>
    </div>
  );
}
