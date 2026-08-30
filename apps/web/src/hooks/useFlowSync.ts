import type { FlowSpec } from '@flowspec/domain';
import { flowSpecSchema } from '@flowspec/domain';
import type { LockInfo } from '@flowspec/lock';
import * as React from 'react';
import { usePreviewStore } from '../store/preview-store.js';

export function useFlowSync(opts: {
  api: (p: string) => string;
  apiBase: string;
  id: string;
  dir: string;
  holder: string;
}): { fetchAll: () => Promise<void>; wsSend: (spec: FlowSpec) => void } {
  const { api, apiBase, id, dir, holder } = opts;
  const { setSpec, setDraft, setLock, setLoading, setError } = usePreviewStore();

  const fetchAll = React.useCallback(async () => {
    try {
      const [specRes, lockRes] = await Promise.all([
        fetch(api(`/api/flow-spec/${encodeURIComponent(id)}?dir=${encodeURIComponent(dir)}`)),
        fetch(api(`/api/flow-spec/${encodeURIComponent(id)}/lock?dir=${encodeURIComponent(dir)}`)),
      ]);
      if (!specRes.ok) {
        const text = await specRes.text();
        throw new Error(`spec ${specRes.status}: ${text}`);
      }
      const specJson = (await specRes.json()) as { spec: unknown };
      const parsed = flowSpecSchema.safeParse(specJson.spec);
      // validated via flowSpecSchema; fallback to raw cast if schema mismatch to keep preview tolerant
      const specData = parsed.success ? parsed.data : (specJson.spec as FlowSpec);
      const lockJson = lockRes.ok
        ? ((await lockRes.json()) as { locked: boolean; info: LockInfo | null })
        : { locked: false, info: null };
      setSpec(specData);
      setDraft(specData);
      setLock(lockJson);
      setLoading(false);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoading(false);
      setError(msg);
    }
  }, [api, id, dir, setSpec, setDraft, setLock, setLoading, setError]);

  const wsRef = React.useRef<WebSocket | null>(null);
  const fetchAllRef = React.useRef(fetchAll);
  React.useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  const wsSend = React.useCallback(
    (spec: FlowSpec) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'patch', spec, holder }));
      } else {
        void fetch(api(`/api/flow-spec/${encodeURIComponent(id)}?dir=${encodeURIComponent(dir)}`), {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'x-flow-lock-holder': holder },
          body: JSON.stringify({ holder, spec }),
        })
          .then(() => void fetchAllRef.current())
          .catch(() => {});
      }
    },
    [holder, api, id, dir]
  );

  React.useEffect(() => {
    void fetchAllRef.current();
    let es: EventSource | null = null;
    let fallback: number | null = null;
    let closed = false;
    const startPolling = () => {
      if (closed || fallback !== null) return;
      fallback = window.setInterval(() => void fetchAllRef.current(), 3000);
    };
    let ws: WebSocket | null = null;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const base = apiBase
        ? apiBase.replace(/^http(s)?:/, proto)
        : `${proto}//${window.location.host}`;
      const wsUrl = `${base}/ws/flow-spec/${encodeURIComponent(id)}?dir=${encodeURIComponent(dir)}&holder=${encodeURIComponent(holder)}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (fallback !== null) {
          window.clearInterval(fallback);
          fallback = null;
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'spec' && msg.spec) {
            if (msg.from && msg.from === holder) return;
            const res = flowSpecSchema.safeParse(msg.spec);
            const parsed = res.success ? res.data : (msg.spec as FlowSpec);
            setSpec(parsed);
            setDraft(parsed);
            if (msg.lock) setLock(msg.lock as { locked: boolean; info: LockInfo | null });
          } else if (msg.type === 'lock' && msg.lock) {
            setLock(msg.lock as { locked: boolean; info: LockInfo | null });
          } else if (msg.type === 'update') {
            void fetchAllRef.current();
          }
        } catch {}
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
        if (wsRef.current === ws) wsRef.current = null;
        try {
          const watchUrl = api(
            `/api/flow-spec/${encodeURIComponent(id)}/watch?dir=${encodeURIComponent(dir)}`
          );
          es = new EventSource(watchUrl);
          es.addEventListener('update', () => void fetchAllRef.current());
          es.onmessage = () => void fetchAllRef.current();
          es.onerror = () => {
            if (es) {
              try {
                es.close();
              } catch {}
              es = null;
            }
            startPolling();
          };
        } catch {
          startPolling();
        }
      };
      ws.onclose = () => {
        if (!closed && !es && fallback === null) startPolling();
        if (wsRef.current === ws) wsRef.current = null;
      };
    } catch {
      try {
        const watchUrl = api(
          `/api/flow-spec/${encodeURIComponent(id)}/watch?dir=${encodeURIComponent(dir)}`
        );
        es = new EventSource(watchUrl);
        es.addEventListener('update', () => void fetchAllRef.current());
        es.onmessage = () => void fetchAllRef.current();
        es.onerror = () => {
          if (es) {
            try {
              es.close();
            } catch {}
            es = null;
          }
          startPolling();
        };
      } catch {
        startPolling();
      }
    }
    const fallbackTimer = window.setTimeout(() => {
      if (!closed && !es && wsRef.current?.readyState !== WebSocket.OPEN) startPolling();
    }, 2000);
    return () => {
      closed = true;
      window.clearTimeout(fallbackTimer);
      try {
        ws?.close();
      } catch {}
      if (wsRef.current === ws) wsRef.current = null;
      if (es)
        try {
          es.close();
        } catch {}
      if (fallback !== null) window.clearInterval(fallback);
    };
  }, [api, apiBase, id, dir, holder, setSpec, setDraft, setLock]);

  return { fetchAll, wsSend };
}
