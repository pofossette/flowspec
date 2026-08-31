import { VCursorOverlay } from '@flowspec/web';
import { Card, Dropdown, Spinner } from '@heroui/react';
import * as React from 'react';
import { AppHeader } from './components/AppHeader.js';
import { FlowAside } from './components/FlowAside.js';
import { LeftNav } from './components/LeftNav.js';

// 重型组件按需懒加载，减少首屏 JS
const FlowMapCanvas = React.lazy(() =>
  import('@flowspec/web').then((m) => ({ default: m.FlowMapCanvas }))
);
const WorkspaceModal = React.lazy(() =>
  import('./components/WorkspaceModal.js').then((m) => ({ default: m.WorkspaceModal }))
);

import { useFlowActions } from './hooks/useFlowActions.js';
import { useFlowList } from './hooks/useFlowList.js';
import { useFlowSync } from './hooks/useFlowSync.js';
import { useThemeSync } from './hooks/useThemeSync.js';
import { usePreviewStore } from './store/preview-store.js';
import { cleanUrlDirParam, displayDir } from './utils/dir.js';

function useQuery(): URLSearchParams {
  const [search, setSearch] = React.useState(() =>
    typeof window !== 'undefined' ? window.location.search : ''
  );
  React.useEffect(() => {
    const onChange = (): void => setSearch(window.location.search);
    window.addEventListener('popstate', onChange);
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) };
  }
  componentDidCatch(e: unknown): void {
    console.error(e);
  }
  render(): React.ReactNode {
    if (this.state.error)
      return (
        <div className="p-6 text-danger whitespace-pre-wrap">渲染错误: {this.state.error}</div>
      );
    return this.props.children;
  }
}

export default function App(): React.JSX.Element {
  const query = useQuery();
  const showVCursor =
    query.get('vcursor') === '1' ||
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_E2E === '1');
  // Preserve initial navigation params (dir/id/holder/api) across cleanUrlDirParam's replaceState
  // which removes dir from URL – query is reactive for vcursor but dir must remain stable
  const initialParamsRef = React.useRef<URLSearchParams | null>(null);
  if (initialParamsRef.current === null) {
    initialParamsRef.current = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    );
  }
  const initialQuery = initialParamsRef.current;
  const initialId = initialQuery.get('id') ?? 'demo';
  const rawDir = initialQuery.get('dir') ?? 'flowspec';
  // 内部仍用绝对/原始 dir 请求后端，展示层用 displayDir 避免暴露宿主完整目录
  const dir = rawDir;
  const dirDisplay = displayDir(rawDir);
  const holder = initialQuery.get('holder') ?? 'web:local';
  const apiBase = initialQuery.get('api') ?? '';
  const api = React.useCallback((p: string) => `${apiBase}${p}`, [apiBase]);

  // 首次挂载即清理地址栏中的绝对 dir
  React.useEffect(() => {
    cleanUrlDirParam();
  }, []);

  const { flowList, activeId, id, menuCollapsed, setMenuCollapsed, handleSwitchFlow, refresh } =
    useFlowList({ dir, api, initialId });
  const { fetchAll, wsSend } = useFlowSync({ api, apiBase, id, dir, holder });
  const [workspaceModalOpen, setWorkspaceModalOpen] = React.useState(false);
  const [fullList, setFullList] = React.useState<
    Array<{ id: string; title: string; path: string; rootId: string }>
  >([]);

  const refreshFull = React.useCallback(async () => {
    try {
      const res = await fetch(api(`/api/flow-spec/full?dir=${encodeURIComponent(dir)}`));
      if (!res.ok) return;
      const j = (await res.json()) as {
        entries?: Array<{ id: string; title: string; path: string; rootId: string }>;
      };
      if (j.entries) setFullList(j.entries);
    } catch {}
  }, [api, dir]);

  React.useEffect(() => {
    if (workspaceModalOpen) void refreshFull();
  }, [workspaceModalOpen, refreshFull]);

  const handleWorkspaceRefresh = React.useCallback(() => {
    refresh();
    void refreshFull();
  }, [refresh, refreshFull]);
  const { spec, draft, selection, message, loading, error, saving, setSelection } =
    usePreviewStore();
  const { mode, setMode, effectiveTheme } = useThemeSync();
  const {
    locked,
    lockInfo,
    isOwnedByMe,
    editMode,
    readOnly,
    handleChange,
    handleSave,
    handleUnlock,
    handleToggleEdit,
    handleAddNode,
    handleUpdateNode,
    handleUpdateEdge,
  } = useFlowActions({ api, id, dir, holder, fetchAll, wsSend });

  // 访问不存在资源自动重定向到已存在 URL（workspace 优先，full 兜底）
  React.useEffect(() => {
    if (!error) return;
    const isNotFound =
      /404|not found|flowspec ".*?" not found/i.test(error) || error.includes('spec 404');
    if (!isNotFound) return;
    const fallback = flowList[0]?.id ?? fullList[0]?.id ?? null;
    if (fallback && fallback !== id) {
      handleSwitchFlow(fallback);
    }
  }, [error, flowList, fullList, id, handleSwitchFlow]);

  React.useEffect(() => {
    (window as unknown as { __flowHandleSave?: typeof handleSave }).__flowHandleSave = handleSave; // lib type gap: window augmentation for e2e
    return () => {
      delete (window as unknown as { __flowHandleSave?: unknown }).__flowHandleSave; // lib type gap: window augmentation for e2e
    };
  }, [handleSave]);

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center gap-3">
        <Spinner size="lg" />
        <span className="text-sm text-muted">加载中… {id}</span>
      </div>
    );
  if (error) {
    const isNotFound =
      /404|not found|flowspec ".*?" not found/i.test(error) || error.includes('spec 404');
    // 若为 404 且已有可重定向目标，静默重定向而非展示错误页（避免用户感知宿主持完整目录）
    if (isNotFound && (flowList[0]?.id ?? fullList[0]?.id)) {
      return (
        <div className="flex h-screen items-center justify-center gap-3">
          <Spinner size="lg" />
          <span className="text-sm text-muted">
            资源不存在，正重定向至 {flowList[0]?.id ?? fullList[0]?.id}…
          </span>
        </div>
      );
    }
    return (
      <div className="p-6">
        <Card className="border-danger/20 bg-danger/5 p-6 text-danger">加载失败: {error}</Card>
      </div>
    );
  }
  if (!spec || !draft) return <div className="p-6">无数据</div>;
  const isEmptyGraph = spec.nodes.length === 0;

  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col bg-panel-bg text-panel-text">
        {showVCursor ? <VCursorOverlay /> : null}
        <AppHeader
          spec={spec}
          id={id}
          dir={dirDisplay}
          mode={mode}
          setMode={setMode}
          locked={locked}
          isOwnedByMe={isOwnedByMe}
          lockHolder={lockInfo?.holder ?? undefined}
          lockAcquiredAt={lockInfo?.acquiredAt}
          editMode={editMode}
          readOnly={readOnly}
          saving={saving}
          onToggleEdit={() => void handleToggleEdit()}
          onSave={() => void handleSave()}
          onRefresh={() => void fetchAll()}
          onUnlock={() => void handleUnlock()}
        />
        {message ? (
          <div className="border-b border-default-200 bg-default-50 px-4 py-2 text-sm text-default-600">
            {message}
          </div>
        ) : null}
        {isEmptyGraph ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            空图 — 纯正文文件（无 ^^^block 块），预览显示空图而非报错
          </div>
        ) : null}
        <div className="flex flex-1 min-h-0">
          <LeftNav
            flowList={flowList}
            activeId={activeId}
            dir={dirDisplay}
            menuCollapsed={menuCollapsed}
            onToggle={() => setMenuCollapsed((v) => !v)}
            onSwitchFlow={handleSwitchFlow}
            onManage={() => setWorkspaceModalOpen(true)}
          />
          <React.Suspense fallback={null}>
            <WorkspaceModal
              open={workspaceModalOpen}
              onClose={() => setWorkspaceModalOpen(false)}
              dir={dir}
              api={api}
              workspaceList={
                flowList as Array<{ id: string; title: string; path: string; rootId: string }>
              }
              fullList={fullList}
              onRefresh={handleWorkspaceRefresh}
            />
          </React.Suspense>
          <div className="flex flex-1 min-w-0 flex-col bg-panel-bg p-4 min-h-0">
            <div className="flex-1 min-h-0 relative">
              {!readOnly && editMode ? (
                <div className="absolute left-4 top-10 z-[5]">
                  <Dropdown>
                    <Dropdown.Trigger className="h-7 gap-1 rounded-lg border border-default-200 bg-white px-2.5 text-xs font-medium shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                      ＋ 添加节点
                    </Dropdown.Trigger>
                    <Dropdown.Popover placement="bottom start">
                      <Dropdown.Menu
                        onAction={(key) => void handleAddNode(String(key))}
                        className="min-w-[160px] p-1"
                      >
                        <Dropdown.Item id="task" textValue="task 任务">
                          task 任务
                        </Dropdown.Item>
                        <Dropdown.Item id="branch" textValue="branch 分支">
                          branch 分支
                        </Dropdown.Item>
                        <Dropdown.Item id="goal" textValue="goal 目标">
                          goal 目标
                        </Dropdown.Item>
                        <Dropdown.Item id="milestone" textValue="milestone 里程碑">
                          milestone 里程碑
                        </Dropdown.Item>
                        <Dropdown.Item id="decision" textValue="decision 决策">
                          decision 决策
                        </Dropdown.Item>
                        <Dropdown.Item id="question" textValue="question 问题">
                          question 问题
                        </Dropdown.Item>
                        <Dropdown.Item id="risk" textValue="risk 风险">
                          risk 风险
                        </Dropdown.Item>
                        <Dropdown.Item id="insight" textValue="insight 洞察">
                          insight 洞察
                        </Dropdown.Item>
                        <Dropdown.Item id="note" textValue="note 备注">
                          note 备注
                        </Dropdown.Item>
                        <Dropdown.Item id="leaf" textValue="leaf 叶子">
                          leaf 叶子
                        </Dropdown.Item>
                        <Dropdown.Item id="root" textValue="root 根">
                          root 根
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>
              ) : null}
              <ErrorBoundary>
                <React.Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-default-500">
                      <Spinner size="sm" />
                      加载画布…
                    </div>
                  }
                >
                  <FlowMapCanvas
                    spec={draft}
                    onChange={handleChange}
                    readOnly={readOnly}
                    lockHolder={lockInfo?.holder}
                    selected={selection}
                    onSelection={setSelection}
                    colorMode={effectiveTheme}
                  />
                </React.Suspense>
              </ErrorBoundary>
            </div>
          </div>
          <FlowAside
            draft={draft}
            selection={selection}
            readOnly={readOnly}
            onClearSelection={() => setSelection(null)}
            onUpdateNode={handleUpdateNode}
            onUpdateEdge={handleUpdateEdge}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}
