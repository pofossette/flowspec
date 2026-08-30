import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecSchema } from '@flowspec/domain';
import {
  getLockStatus,
  loadSpecRaw,
  resolveLockPath,
  resolveSpecPath,
  saveSpecRaw,
} from '@flowspec/lock';
import type { FastifyInstance } from 'fastify';
import {
  broadcast,
  ensureFileWatcher,
  getRoom,
  resolveEffectiveDir,
  roomKey,
  rooms,
  toApiError,
  watchers,
} from './helpers.js';

export function registerWsRoutes(app: FastifyInstance, flowspecDir: string): void {
  // NOTE: SSE `/api/flow-spec/:id/watch` co-located in ws domain to keep flow-spec-routes ≤300.
  // Move to flow-spec-routes only when lock routes are split to a 6th file.
  // SSE watch (保留兼容)
  app.get('/api/flow-spec/:id/watch', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const specPath = resolveSpecPath(decodedId, dir);
    const lockPath = resolveLockPath(decodedId, dir);
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    });
    reply.raw.write(': connected\n\n');
    let lastSpecMtime = 0;
    let lastLockMtime = 0;
    try {
      lastSpecMtime = fs.statSync(specPath).mtimeMs;
    } catch {}
    try {
      lastLockMtime = fs.statSync(lockPath).mtimeMs;
    } catch {}
    const timer = setInterval(() => {
      let curSpec = 0;
      let curLock = 0;
      let specExists = true;
      try {
        curSpec = fs.statSync(specPath).mtimeMs;
      } catch {
        specExists = false;
        curSpec = 0;
      }
      try {
        curLock = fs.statSync(lockPath).mtimeMs;
      } catch {
        curLock = 0;
      }
      const specChanged = specExists && curSpec !== lastSpecMtime;
      const lockChanged = curLock !== lastLockMtime;
      if (specChanged || lockChanged) {
        lastSpecMtime = curSpec;
        lastLockMtime = curLock;
        const payload = JSON.stringify({ ts: Date.now(), specChanged, lockChanged, specExists });
        reply.raw.write(`event: update\n`);
        reply.raw.write(`data: ${payload}\n\n`);
      } else {
        reply.raw.write(`: hb ${Date.now()}\n\n`);
      }
    }, 600);
    const watcherList: fs.FSWatcher[] = [];
    try {
      const dirOfSpec = path.dirname(specPath);
      if (fs.existsSync(dirOfSpec)) {
        const w = fs.watch(dirOfSpec, (_evt, name) => {
          if (!name) return;
          if (name === path.basename(specPath) || name === path.basename(lockPath)) {
            setTimeout(() => {
              try {
                const cur = fs.statSync(specPath).mtimeMs;
                if (cur !== lastSpecMtime) {
                  lastSpecMtime = cur;
                  reply.raw.write(
                    `event: update\ndata: ${JSON.stringify({ ts: Date.now(), specChanged: true })}\n\n`
                  );
                }
              } catch {}
            }, 30);
          }
        });
        watcherList.push(w);
      }
    } catch {}
    req.raw.on('close', () => {
      clearInterval(timer);
      for (const w of watcherList)
        try {
          w.close();
        } catch {}
      try {
        reply.raw.end();
      } catch {}
    });
    return reply;
  });

  // WS: 实时同频，无需每次 Save — 延迟首包避免浏览器 WebSocket 未就绪
  app.get('/ws/flow-spec/:id', { websocket: true }, (socket, req) => {
    const { id } = req.params as { id: string };
    const rawUrl = req.url ?? '';
    const url = new URL(rawUrl, `http://${req.headers.host ?? '127.0.0.1'}`);
    const decodedId = decodeURIComponent(id);
    const dir = resolveEffectiveDir(
      decodedId,
      url.searchParams.get('dir') ?? flowspecDir,
      flowspecDir
    );
    const holder = url.searchParams.get('holder') ?? 'web:unknown';
    const room = getRoom(decodedId, dir);
    room.add(socket);
    ensureFileWatcher(decodedId, dir);
    setTimeout(() => {
      try {
        const raw = loadSpecRaw(decodedId, dir);
        const parsed = raw ? flowSpecSchema.safeParse(raw) : null;
        const lock = getLockStatus(decodedId, dir);
        socket.send(
          JSON.stringify({
            type: 'init',
            spec: parsed?.success ? parsed.data : null,
            lock,
            holder,
          })
        );
      } catch {}
    }, 30);
    socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'patch' && msg.spec) {
          const parsed = flowSpecSchema.safeParse(msg.spec);
          if (!parsed.success) {
            socket.send(JSON.stringify({ type: 'error', error: parsed.error.message }));
            return;
          }
          const lock = getLockStatus(decodedId, dir);
          const senderHolder = (msg.holder as string | undefined) ?? holder;
          if (lock.locked && senderHolder && lock.info.holder !== senderHolder) {
            socket.send(JSON.stringify({ type: 'error', error: `locked by ${lock.info.holder}` }));
            return;
          }
          saveSpecRaw(decodedId, parsed.data, dir);
          broadcast(
            decodedId,
            dir,
            {
              type: 'spec',
              spec: parsed.data,
              lock: getLockStatus(decodedId, dir),
              from: senderHolder,
            },
            socket
          );
          socket.send(JSON.stringify({ type: 'ack', ts: Date.now() }));
        } else if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch (e: unknown) {
        try {
          socket.send(JSON.stringify({ type: 'error', error: toApiError(e) }));
        } catch {}
      }
    });
    socket.on('close', () => {
      room.delete(socket);
      if (room.size === 0) {
        const key = roomKey(decodedId, dir);
        rooms.delete(key);
        const w = watchers.get(key);
        if (w)
          try {
            w.close();
          } catch {}
        watchers.delete(key);
      }
    });
  });
}
