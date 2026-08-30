import { create } from 'zustand';
import type { FlowSpec } from '@flowspec/domain';
import type { LockInfo } from '@flowspec/lock';

export type PreviewSelection = { type: 'node' | 'edge'; id: string } | null;

type PreviewStore = {
  spec: FlowSpec | null;
  draft: FlowSpec | null;
  lock: { locked: boolean; info: LockInfo | null } | null;
  selection: PreviewSelection;
  message: string | null;
  saving: boolean;
  loading: boolean;
  error: string | null;
  // actions
  setSpec: (v: FlowSpec | null) => void;
  setDraft: (v: FlowSpec | null) => void;
  setLock: (v: { locked: boolean; info: LockInfo | null } | null) => void;
  setSelection: (v: PreviewSelection) => void;
  setMessage: (v: string | null) => void;
  setSaving: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
};

export const usePreviewStore = create<PreviewStore>((set) => ({
  spec: null,
  draft: null,
  lock: null,
  selection: null,
  message: null,
  saving: false,
  loading: true,
  error: null,
  setSpec: (v) => set({ spec: v }),
  setDraft: (v) => set({ draft: v }),
  setLock: (v) => set({ lock: v }),
  setSelection: (v) => set({ selection: v }),
  setMessage: (v) => set({ message: v }),
  setSaving: (v) => set({ saving: v }),
  setLoading: (v) => set({ loading: v }),
  setError: (v) => set({ error: v }),
}));
