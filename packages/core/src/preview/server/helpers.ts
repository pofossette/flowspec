import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getLockStatus,
  loadSpecRaw,
  readRawSpecContent,
  resolveLockPath,
  resolveSpecBodyAndFrontmatter,
  resolveSpecPath,
} from '../../lock/file-lock.js';
import { flowSpecSchema } from '../../domain/flow-spec.js';

export const TRAPMAP_GATEWAY_URL = process.env.TRAPMAP_GATEWAY_URL ?? 'http://127.0.0.1:4000';
export const TRAPMAP_API_KEY =
  process.env.TRAPMAP_API_KEY ?? process.env.TRAPMAP_SYSTEM_ADMIN_KEY ?? null;

// ── dir helpers ──
function findRepoRootForDir(start = process.cwd()): string {
  let cur = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    if (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(start);
}
export function resolveFlowspecDir(dirParam: string | undefined, fallback: string): string {
  if (!dirParam) return fallback;
  if (path.isAbsolute(dirParam)) return dirParam;
  return path.resolve(findRepoRootForDir(), dirParam);
}

export function resolveEffectiveDir(id: string, dirParam: string, fallback: string): string {
  if (dirParam !== fallback && loadSpecRaw(id, dirParam) === null) {
    const fb = loadSpecRaw(id, fallback);
    if (fb) return fallback;
  }
  return dirParam;
}

export function toApiError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── broadcast helpers (shared WS rooms + fs.watch) ──
// lib type gap: Fastify WebSocket socket type is framework-specific; keep helpers agnostic with minimal shape
type WsSocket = { send(data: string): void };
export const rooms = new Map<string, Set<WsSocket>>();

export function roomKey(id: string, dir: string): string {
  return `${dir}::${id}`;
}

export function getRoom(id: string, dir: string): Set<WsSocket> {
  const key = roomKey(id, dir);
  if (!rooms.has(key)) rooms.set(key, new Set());
  return rooms.get(key)!;
}

export function broadcast(id: string, dir: string, payload: unknown, exclude?: WsSocket): void {
  const room = getRoom(id, dir);
  const data = JSON.stringify(payload);
  for (const sock of room) {
    if (sock === exclude) continue;
    try {
      sock.send(data);
    } catch {}
  }
}

export const watchers = new Map<string, fs.FSWatcher>();

export function ensureFileWatcher(id: string, dir: string): void {
  const specPath = resolveSpecPath(id, dir);
  const lockPath = resolveLockPath(id, dir);
  const key = roomKey(id, dir);
  if (watchers.has(key)) return;
  const dirOfSpec = path.dirname(specPath);
  if (!fs.existsSync(dirOfSpec)) return;
  try {
    const w = fs.watch(dirOfSpec, (evt, name) => {
      if (!name) return;
      if (name !== path.basename(specPath) && name !== path.basename(lockPath)) return;
      setTimeout(() => {
        try {
          const raw = loadSpecRaw(id, dir);
          const parsed = raw ? flowSpecSchema.safeParse(raw) : null;
          const lock = getLockStatus(id, dir);
          if (parsed && parsed.success) {
            const rawContent = readRawSpecContent(specPath);
            const { bodyMarkdown, frontmatter } = resolveSpecBodyAndFrontmatter(raw, rawContent);
            broadcast(id, dir, {
              type: 'spec',
              spec: parsed.data,
              lock,
              bodyMarkdown,
              frontmatter,
            });
          } else {
            broadcast(id, dir, { type: 'update', ts: Date.now() });
          }
        } catch {}
      }, 80);
    });
    watchers.set(key, w);
  } catch {}
}

export function getTrapmapGatewayUrl(
  req: {
    query?: Record<string, string> | undefined;
    headers: Record<string, string | string[] | undefined>;
  },
  fallback: string = TRAPMAP_GATEWAY_URL,
): string {
  const q = req.query as Record<string, string> | undefined;
  const headerUrl = (req.headers['x-trapmap-gateway-url'] as string | undefined)?.trim();
  const raw = (q?.gatewayUrl?.trim() || headerUrl || fallback).replace(/\/$/, '');
  return raw;
}
