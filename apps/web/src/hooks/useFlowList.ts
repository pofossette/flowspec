import * as React from 'react';
import { usePreviewStore } from '../store/preview-store.js';

export type FlowListEntry = { id: string; title: string; path: string };

export function useFlowList(opts: { dir: string; api: (p: string) => string; initialId: string }): {
  flowList: FlowListEntry[];
  activeId: string;
  id: string;
  menuCollapsed: boolean;
  setMenuCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  handleSwitchFlow: (nextId: string) => void;
} {
  const { dir, api, initialId } = opts;
  const [activeId, setActiveId] = React.useState(initialId);
  const [flowList, setFlowList] = React.useState<FlowListEntry[]>([]);
  const [menuCollapsed, setMenuCollapsed] = React.useState(false);
  const setSelection = usePreviewStore((s) => s.setSelection);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(api(`/api/flow-spec?dir=${encodeURIComponent(dir)}`));
        if (!res.ok) return;
        const j = (await res.json()) as { entries?: FlowListEntry[] };
        if (!cancelled && j.entries) setFlowList(j.entries);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [api, dir]);

  const handleSwitchFlow = React.useCallback(
    (nextId: string) => {
      setActiveId(nextId);
      setSelection(null);
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('id', nextId);
        window.history.pushState(null, '', u.toString());
      } catch {}
    },
    [setSelection]
  );

  React.useEffect(() => {
    if (flowList.length === 0) return;
    if (!flowList.some((f) => f.id === activeId)) {
      handleSwitchFlow(flowList[0]?.id);
    }
  }, [flowList, activeId, handleSwitchFlow]);

  return {
    flowList,
    activeId,
    id: activeId,
    menuCollapsed,
    setMenuCollapsed,
    handleSwitchFlow,
  };
}
