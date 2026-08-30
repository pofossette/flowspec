import { create } from 'zustand';
import type { FlowSpec } from '@flowspec/domain';
import { flowSpecExample } from '@flowspec/domain';
import type { LockInfo } from '@flowspec/lock';

export type FlowSpecState = {
  spec: FlowSpec;
  selectedId: string | null;
  /** Lock held either by CLI agent or by this web session */
  lock: LockInfo | null;
  isLocked: boolean;
  isOwnedByMe: boolean;
  setSpec: (spec: FlowSpec) => void;
  patchSpec: (updater: (prev: FlowSpec) => FlowSpec) => void;
  select: (id: string | null) => void;
  addNode: (node: FlowSpec['nodes'][number]) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: FlowSpec['edges'][number]) => void;
  removeEdge: (id: string) => void;
  // lock protocol
  setLock: (info: LockInfo | null) => void;
  /** Web editing: acquire lock on first edit (holder e.g. web:<userId>) */
  ensureWebLock: (holder: string) => LockInfo | null;
  /** Called on Save: persist then release */
  markSavedAndUnlock: () => void;
  /** Direct release (without save) */
  clearLock: () => void;
};

function holderIsWeb(holder: string): boolean {
  return holder.startsWith('web:');
}

export const useFlowSpecStore = create<FlowSpecState>((set, get) => ({
  spec: flowSpecExample,
  selectedId: null,
  lock: null,
  isLocked: false,
  isOwnedByMe: false,
  setSpec: (spec) => set({ spec }),
  patchSpec: (updater) => set({ spec: updater(get().spec) }),
  select: (selectedId) => set({ selectedId }),
  addNode: (node) =>
    set((s) => {
      // auto-acquire web lock on first mutation if not locked
      let lock = s.lock;
      let isOwnedByMe = s.isOwnedByMe;
      let isLocked = s.isLocked;
      if (!isLocked) {
        lock = { holder: 'web:local', acquiredAt: new Date().toISOString() };
        isLocked = true;
        isOwnedByMe = true;
      }
      return {
        spec: { ...s.spec, nodes: [...s.spec.nodes, node], updatedAt: new Date().toISOString() },
        lock,
        isLocked,
        isOwnedByMe,
      };
    }),
  removeNode: (id) =>
    set((s) => ({
      spec: {
        ...s.spec,
        nodes: s.spec.nodes.filter((n) => n.id !== id),
        edges: s.spec.edges.filter((e) => e.source !== id && e.target !== id),
        updatedAt: new Date().toISOString(),
      },
    })),
  addEdge: (edge) =>
    set((s) => ({
      spec: { ...s.spec, edges: [...s.spec.edges, edge], updatedAt: new Date().toISOString() },
    })),
  removeEdge: (id) =>
    set((s) => ({
      spec: {
        ...s.spec,
        edges: s.spec.edges.filter((e) => e.id !== id),
        updatedAt: new Date().toISOString(),
      },
    })),
  setLock: (lock) =>
    set(() => {
      if (!lock) return { lock: null, isLocked: false, isOwnedByMe: false };
      const isOwned = holderIsWeb(lock.holder);
      return { lock, isLocked: true, isOwnedByMe: isOwned };
    }),
  ensureWebLock: (holder) => {
    const s = get();
    if (s.isLocked) return s.lock;
    const info: LockInfo = { holder, acquiredAt: new Date().toISOString() };
    set({ lock: info, isLocked: true, isOwnedByMe: true });
    return info;
  },
  markSavedAndUnlock: () => set({ lock: null, isLocked: false, isOwnedByMe: false }),
  clearLock: () => set({ lock: null, isLocked: false, isOwnedByMe: false }),
}));
