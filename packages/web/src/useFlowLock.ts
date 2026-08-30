import * as React from 'react';
import type { LockInfo } from '@flowspec/lock';

export type FlowLockState = {
  locked: boolean;
  info: LockInfo | null;
  isOwnedByMe: boolean;
  readOnly: boolean; // locked && not owned by me => preview only
};

export type UseFlowLockOptions = {
  id: string;
  /** Current web holder, e.g. web:<user> . Used to decide isOwnedByMe */
  holder?: string;
  /** Poll interval ms, default 3000 */
  intervalMs?: number;
  /** Fetch lock status; default fetches /api/flow-spec/:id/lock if available, else returns unlocked */
  fetchLock?: (id: string) => Promise<{ locked: boolean; info: LockInfo | null }>;
  /** Acquire lock on demand; default no-op */
  acquire?: (id: string) => Promise<LockInfo>;
  /** Release lock on save; default no-op */
  release?: (id: string) => Promise<void>;
};

/**
 * Polls lock status and exposes readOnly semantics:
 * - locked && !isOwnedByMe => preview only
 * - otherwise editable
 *
 * For pure file-lock without backend, pass fetchLock that hits your host's
 * /api/flow-spec/:id/lock. For web local-only, fetchLock may read from
 * localStorage mock.
 */
export function useFlowLock(opts: UseFlowLockOptions): FlowLockState & {
  refresh: () => Promise<void>;
  acquire: () => Promise<LockInfo | null>;
  release: () => Promise<void>;
} {
  const {
    id,
    holder,
    intervalMs = 3000,
    fetchLock,
    acquire: acquireOpt,
    release: releaseOpt,
  } = opts;
  const [state, setState] = React.useState<FlowLockState>({
    locked: false,
    info: null,
    isOwnedByMe: false,
    readOnly: false,
  });

  const doFetch = React.useCallback(async () => {
    if (!fetchLock) return;
    try {
      const res = await fetchLock(id);
      const isOwned = !!holder && !!res.info && res.info.holder === holder;
      setState({
        locked: res.locked,
        info: res.info,
        isOwnedByMe: isOwned,
        readOnly: res.locked && !isOwned,
      });
    } catch {
      // keep last state
    }
  }, [id, holder, fetchLock]);

  React.useEffect(() => {
    void doFetch();
    if (!fetchLock) return;
    const t = setInterval(() => void doFetch(), intervalMs);
    return () => clearInterval(t);
  }, [doFetch, fetchLock, intervalMs]);

  const acquire = React.useCallback(async () => {
    if (!acquireOpt) return null;
    const info = await acquireOpt(id);
    setState({ locked: true, info, isOwnedByMe: true, readOnly: false });
    return info;
  }, [id, acquireOpt]);

  const release = React.useCallback(async () => {
    if (!releaseOpt) return;
    await releaseOpt(id);
    setState({ locked: false, info: null, isOwnedByMe: false, readOnly: false });
  }, [id, releaseOpt]);

  return { ...state, refresh: doFetch, acquire, release };
}
