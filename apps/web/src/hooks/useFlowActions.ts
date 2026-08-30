import * as React from 'react';
import type { FlowSpec } from '@flowspec/domain';
import type { LockInfo } from '@flowspec/lock';
import { usePreviewStore } from '../store/preview-store.js';

export function useFlowActions(opts: {
  api: (p: string) => string;
  id: string;
  dir: string;
  holder: string;
  fetchAll: () => Promise<void>;
  wsSend: (spec: FlowSpec) => void;
}): {
  locked: boolean;
  lockInfo: LockInfo | null;
  isOwnedByMe: boolean;
  editMode: boolean;
  readOnly: boolean;
  handleChange: (next: FlowSpec) => Promise<void>;
  handleSave: () => Promise<void>;
  handleUnlock: () => Promise<void>;
  handleToggleEdit: () => Promise<void>;
  handleAddNode: (kind: string) => Promise<void>;
  handleUpdateNode: (
    p: Partial<{ label: string; content: string; kind: string; status: string }>,
  ) => Promise<void>;
  handleUpdateEdge: (p: Partial<{ label: string; content: string; kind: string }>) => Promise<void>;
} {
  const { api, id, dir, holder, fetchAll, wsSend } = opts;
  const { draft, lock, selection, setDraft, setSelection, setMessage, setSaving } =
    usePreviewStore();
  const locked = lock?.locked ?? false;
  const lockInfo = lock?.info ?? null;
  const isOwnedByMe = !!lockInfo && lockInfo.holder === holder;
  const [editMode, setEditMode] = React.useState(false);
  const readOnly = !editMode || (locked && !isOwnedByMe);

  const ensureLock = React.useCallback(async () => {
    try {
      const res = await fetch(
        api(`/api/flow-spec/${encodeURIComponent(id)}/lock?dir=${encodeURIComponent(dir)}`),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ holder, note: 'web editing' }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
      return true;
    } catch (e: unknown) {
      setMessage(`加锁失败: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }, [api, id, dir, holder, fetchAll, setMessage]);

  const handleChange = React.useCallback(
    async (next: FlowSpec) => {
      if (!locked) {
        const ok = await ensureLock();
        if (!ok) return;
      } else if (readOnly) {
        setMessage('已锁定，仅允许预览');
        return;
      }
      setDraft(next);
      wsSend(next);
    },
    [locked, readOnly, ensureLock, setDraft, setMessage, wsSend],
  );

  const handleSave = React.useCallback(async () => {
    if (!draft) return;
    if (readOnly) {
      setMessage('已锁定，不允许保存');
      return;
    }
    if (!locked) {
      const ok = await ensureLock();
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        api(`/api/flow-spec/${encodeURIComponent(id)}?dir=${encodeURIComponent(dir)}`),
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'x-flow-lock-holder': holder },
          body: JSON.stringify({ holder, spec: draft }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setMessage('已保存并自动解锁');
      await fetchAll();
    } catch (e: unknown) {
      setMessage(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [draft, readOnly, locked, ensureLock, api, id, dir, holder, fetchAll, setMessage, setSaving]);

  const handleUnlock = React.useCallback(async () => {
    try {
      const res = await fetch(
        api(
          `/api/flow-spec/${encodeURIComponent(id)}/lock?dir=${encodeURIComponent(dir)}&holder=${encodeURIComponent(holder)}`,
        ),
        {
          method: 'DELETE',
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setMessage('已解锁');
      await fetchAll();
    } catch (e: unknown) {
      setMessage(`解锁失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [api, id, dir, holder, fetchAll, setMessage]);

  const handleToggleEdit = React.useCallback(async () => {
    if (!editMode) {
      if (locked && !isOwnedByMe) {
        setMessage(`无法进入编辑，已被 ${lockInfo?.holder ?? ''} 锁定`);
        return;
      }
      if (!locked) {
        const ok = await ensureLock();
        if (!ok) return;
      }
      setEditMode(true);
      setMessage('已进入编辑模式');
    } else {
      if (isOwnedByMe)
        try {
          await handleUnlock();
        } catch {}
      setEditMode(false);
      setMessage('已切回预览模式');
    }
  }, [editMode, locked, isOwnedByMe, lockInfo, ensureLock, handleUnlock, setMessage]);

  const handleAddNode = React.useCallback(
    async (kind: string) => {
      if (!draft) return;
      if (readOnly) {
        setMessage(editMode ? '已锁定，仅允许预览' : '预览模式下不可添加，请先进入编辑');
        return;
      }
      const newId = `node-${Date.now().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 4)}`;
      const jitter = () => Math.round((Math.random() - 0.5) * 400);
      const next: FlowSpec = {
        ...draft,
        nodes: [
          ...draft.nodes,
          {
            id: newId,
            kind: kind as FlowSpec['nodes'][number]['kind'],
            label: `${kind} - 新节点`,
            position: { x: jitter(), y: jitter() },
          },
        ],
        edges: [...draft.edges],
        updatedAt: new Date().toISOString(),
      };
      await handleChange(next);
      setSelection({ type: 'node', id: newId });
      setMessage(`已添加 ${kind} 节点 ${newId}`);
    },
    [draft, readOnly, editMode, handleChange, setSelection, setMessage],
  );

  React.useEffect(() => {
    if (!draft || !selection) return;
    const exists =
      selection.type === 'node'
        ? draft.nodes.some((n) => n.id === selection.id)
        : draft.edges.some((e) => e.id === selection.id);
    if (!exists) setSelection(null);
  }, [draft, selection, setSelection]);

  const handleUpdateNode = React.useCallback(
    async (patch: Partial<{ label: string; content: string; kind: string; status: string }>) => {
      if (!draft || !selection || selection.type !== 'node' || readOnly) return;
      const next: FlowSpec = {
        ...draft,
        nodes: draft.nodes.map((n) =>
          n.id === selection.id
            ? {
                ...n,
                ...(patch.label !== undefined ? { label: patch.label } : {}),
                ...(patch.content !== undefined ? { content: patch.content || undefined } : {}),
                ...(patch.kind ? { kind: patch.kind as FlowSpec['nodes'][number]['kind'] } : {}),
                ...(patch.status !== undefined
                  ? { status: (patch.status as FlowSpec['nodes'][number]['status']) || undefined }
                  : {}),
              }
            : n,
        ),
        updatedAt: new Date().toISOString(),
      };
      await handleChange(next);
    },
    [draft, selection, readOnly, handleChange],
  );

  const handleUpdateEdge = React.useCallback(
    async (patch: Partial<{ label: string; content: string; kind: string }>) => {
      if (!draft || !selection || selection.type !== 'edge' || readOnly) return;
      const next: FlowSpec = {
        ...draft,
        edges: draft.edges.map((e) =>
          e.id === selection.id
            ? {
                ...e,
                ...(patch.label !== undefined ? { label: patch.label || undefined } : {}),
                ...(patch.content !== undefined ? { content: patch.content || undefined } : {}),
                ...(patch.kind ? { kind: patch.kind as FlowSpec['edges'][number]['kind'] } : {}),
              }
            : e,
        ),
        updatedAt: new Date().toISOString(),
      };
      await handleChange(next);
    },
    [draft, selection, readOnly, handleChange],
  );

  return {
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
  };
}
