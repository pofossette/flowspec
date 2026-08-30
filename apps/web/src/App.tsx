import * as React from 'react';
import { Card, Spinner, Dropdown } from '@heroui/react';
import { FlowMapCanvas } from '@flowspec/core/web';
import { usePreviewStore } from './store/preview-store.js';
import { LeftNav } from './components/LeftNav.js';
import { AppHeader } from './components/AppHeader.js';
import { FlowAside } from './components/FlowAside.js';
import { useFlowList } from './hooks/useFlowList.js';
import { useFlowSync } from './hooks/useFlowSync.js';
import { useThemeSync } from './hooks/useThemeSync.js';
import { useFlowActions } from './hooks/useFlowActions.js';

function useQuery(): URLSearchParams {
  return React.useMemo(() => new URLSearchParams(window.location.search), []);
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message + '\n' + (e.stack ?? '') : String(e) };
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
  const initialId = query.get('id') ?? 'demo';
  const dir = query.get('dir') ?? 'flowspec';
  const holder = query.get('holder') ?? 'web:local';
  const apiBase = query.get('api') ?? '';
  const api = React.useCallback((p: string) => `${apiBase}${p}`, [apiBase]);

  const { flowList, activeId, id, menuCollapsed, setMenuCollapsed, handleSwitchFlow } = useFlowList(
    { dir, api, initialId },
  );
  const { fetchAll, wsSend } = useFlowSync({ api, apiBase, id, dir, holder });
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
    handleToggleEdit,
    handleAddNode,
    handleUpdateNode,
    handleUpdateEdge,
  } = useFlowActions({ api, id, dir, holder, fetchAll, wsSend });

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
  if (error)
    return (
      <div className="p-6">
        <Card className="border-danger/20 bg-danger/5 p-6 text-danger">加载失败: {error}</Card>
      </div>
    );
  if (!spec || !draft) return <div className="p-6">无数据</div>;
  const isEmptyGraph = spec.nodes.length === 0;

  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col bg-panel-bg text-panel-text">
        <AppHeader
          spec={spec}
          id={id}
          dir={dir}
          mode={mode}
          setMode={setMode}
          locked={locked}
          isOwnedByMe={isOwnedByMe}
          lockHolder={lockInfo?.holder ?? undefined}
          editMode={editMode}
          readOnly={readOnly}
          saving={saving}
          onToggleEdit={() => void handleToggleEdit()}
          onSave={() => void handleSave()}
          onRefresh={() => void fetchAll()}
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
            dir={dir}
            menuCollapsed={menuCollapsed}
            onToggle={() => setMenuCollapsed((v) => !v)}
            onSwitchFlow={handleSwitchFlow}
          />
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
                <FlowMapCanvas
                  spec={draft}
                  onChange={handleChange}
                  readOnly={readOnly}
                  lockHolder={lockInfo?.holder}
                  selected={selection}
                  onSelection={setSelection}
                  colorMode={effectiveTheme}
                />
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
