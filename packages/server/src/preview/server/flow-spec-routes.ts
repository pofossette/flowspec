import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecSchema } from '@flowspec/domain';
import {
  acquireLock,
  getEmptySpecForPureMarkdown,
  getLockStatus,
  loadSpecRaw,
  readLockFromMarkdown,
  readRawSpecContent,
  releaseLock,
  resolveLockPath,
  resolveSpecBodyAndFrontmatter,
  resolveSpecPath,
  saveSpecRaw,
} from '@flowspec/lock';
import {
  extractBodyMarkdown,
  isMarkdownFlowSpec,
  parseFlowSpecFromMarkdown,
} from '@flowspec/parser';
import type { FastifyInstance } from 'fastify';
import {
  broadcast,
  ensureFileWatcher,
  resolveEffectiveDir,
  resolveFlowspecDir,
  toApiError,
} from './helpers.js';

function getHiddenDirParam(req: { query?: Record<string, string | undefined>; headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const q = req.query as Record<string, string | undefined> | undefined;
  const fromQuery = q?.hiddenDir ?? q?.hidden_dir;
  if (fromQuery) return fromQuery;
  const fromHeader = req.headers?.['x-hidden-dir'] as string | undefined;
  if (fromHeader) return fromHeader;
  // Also support env override for E2E isolation (replaces substring heuristic via explicit dir)
  const envHidden = process.env.FLOWSPEC_HIDDEN_DIR ?? process.env.FLOW_HIDDEN_DIR;
  if (envHidden) return envHidden;
  return undefined;
}

export function registerFlowSpecRoutes(app: FastifyInstance, flowspecDir: string): void {
  // REST: GET list — 预览面板只展示 .flowspec/workspace.json（运行目录下），不走文件扫描回退；workspace 为预览入口
  app.get('/api/flow-spec', async (req, reply) => {
    const dirParam = resolveFlowspecDir(
      (req.query as Record<string, string> | undefined)?.dir as string | undefined,
      flowspecDir
    );
    const dir = path.resolve(dirParam);
    let entries: Array<{ id: string; title: string; path: string; rootId: string }> = [];
    try {
      const { loadWorkspace } = await import('@flowspec/registry');
      const repoRoot = path.dirname(dir);
      for (const r of [process.cwd(), repoRoot]) {
        try {
          const reg = loadWorkspace(r);
          const list = Object.entries(reg.entries)
            .filter(([, v]) => {
              const p = v?.path as string | undefined;
              return !p || p.startsWith('flowspec/') || path.resolve(r, p).startsWith(dir);
            })
            .map(([k, v]) => ({
              id: k,
              title: (v as { title: string }).title,
              path: (v as { path: string }).path,
              rootId: (v as { rootId: string }).rootId,
            }));
          if (list.length > 0) {
            entries = list;
            break;
          }
        } catch {}
      }
    } catch {}
    // 不再回退扫描：只返回 workspace.json 已注册项
    return reply.send({ ok: true, dir, entries, source: 'workspace' });
  });

  // REST: GET full list — .flowspec/full.json 全量扫描（当前目录下所有 flowspec 文档）
  app.get('/api/flow-spec/full', async (req, reply) => {
    const dirParam = resolveFlowspecDir(
      (req.query as Record<string, string> | undefined)?.dir as string | undefined,
      flowspecDir
    );
    const dir = path.resolve(dirParam);
    // ensure full.json is synced
    try {
      const { syncFromFilesystem } = await import('@flowspec/registry');
      const repoRoot = path.dirname(dir);
      // try both cwd and repoRoot
      for (const r of [repoRoot, process.cwd()]) {
        try {
          syncFromFilesystem(r, { flowspecDir: dir, kind: 'full', prune: true });
          break;
        } catch {}
      }
    } catch {}
    let entries: Array<{ id: string; title: string; path: string; rootId: string }> = [];
    try {
      const { loadFull } = await import('@flowspec/registry');
      const repoRoot = path.dirname(dir);
      for (const r of [process.cwd(), repoRoot]) {
        try {
          const reg = loadFull(r);
          const list = Object.entries(reg.entries)
            .filter(([, v]) => {
              const p = v?.path as string | undefined;
              return !p || p.startsWith('flowspec/') || path.resolve(r, p).startsWith(dir);
            })
            .map(([k, v]) => ({
              id: k,
              title: (v as { title: string }).title,
              path: (v as { path: string }).path,
              rootId: (v as { rootId: string }).rootId,
            }));
          if (list.length > 0) {
            entries = list;
            break;
          }
        } catch {}
      }
    } catch {}
    return reply.send({ ok: true, dir, entries, source: 'full' });
  });

  // Workspace add/remove — 供工作区弹窗“移入/移出”使用（仅操作 workspace.json，不删文件；移出保留 full）
  app.post('/api/workspace/add', async (req, reply) => {
    const body = req.body as { id?: string; dir?: string } | undefined;
    const dirParam = resolveFlowspecDir(
      (body?.dir as string | undefined) ?? (req.query as Record<string, string> | undefined)?.dir as string | undefined,
      flowspecDir
    );
    const dir = path.resolve(dirParam);
    const id = (body?.id as string | undefined)?.trim() ?? (req.query as Record<string, string> | undefined)?.id?.trim();
    if (!id) return reply.code(400).send({ ok: false, error: 'missing id' });
    try {
      const { loadFull, loadWorkspace, addEntry } = await import('@flowspec/registry');
      const { syncFromFilesystem } = await import('@flowspec/registry');
      const repoRoot = path.dirname(dir);
      // ensure full is fresh
      for (const r of [repoRoot, process.cwd()]) {
        try { syncFromFilesystem(r, { flowspecDir: dir, kind: 'full', prune: true }); break; } catch {}
      }
      // find entry in full (or workspace) to get path/title
      let entry: { path: string; title: string; rootId: string } | null = null;
      for (const r of [repoRoot, process.cwd()]) {
        try {
          const full = loadFull(r);
          if (full.entries[id]) { entry = full.entries[id] as unknown as typeof entry; break; }
          const ws = loadWorkspace(r);
          if (ws.entries[id]) { entry = ws.entries[id] as unknown as typeof entry; break; }
        } catch {}
      }
      // fallback: try parse file directly at flowspecDir/id.md
      if (!entry) {
        const candidate = path.join(dir, `${id}.md`);
        if (fs.existsSync(candidate)) {
          try {
            const raw = fs.readFileSync(candidate, 'utf-8');
            const parsed = parseFlowSpecFromMarkdown(raw);
            if (parsed) entry = { path: path.relative(path.dirname(dir), candidate).split(path.sep).join('/'), title: parsed.title, rootId: parsed.rootId };
          } catch {}
        }
      }
      if (!entry) return reply.code(404).send({ ok: false, error: `flowspec "${id}" not found in full` });
      // add to workspace (and ensure full has it)
      for (const r of [repoRoot, process.cwd()]) {
        try {
          const ws = loadWorkspace(r);
          if (!(id in ws.entries)) {
            const now = new Date().toISOString();
            addEntry('workspace', id, { path: entry.path, title: entry.title, rootId: entry.rootId, addedAt: now, updatedAt: now }, r);
          }
          const full = loadFull(r);
          if (!(id in full.entries)) {
            const now = new Date().toISOString();
            addEntry('full', id, { path: entry.path, title: entry.title, rootId: entry.rootId, addedAt: now, updatedAt: now }, r);
          }
          break;
        } catch {}
      }
      return reply.send({ ok: true, id });
    } catch (e: unknown) {
      return reply.code(500).send({ ok: false, error: toApiError(e) });
    }
  });

  app.post('/api/workspace/remove', async (req, reply) => {
    const body = req.body as { id?: string; dir?: string } | undefined;
    const dirParam = resolveFlowspecDir(
      (body?.dir as string | undefined) ?? (req.query as Record<string, string> | undefined)?.dir as string | undefined,
      flowspecDir
    );
    const dir = path.resolve(dirParam);
    const id = (body?.id as string | undefined)?.trim() ?? (req.query as Record<string, string> | undefined)?.id?.trim();
    if (!id) return reply.code(400).send({ ok: false, error: 'missing id' });
    try {
      const { loadWorkspace, removeEntry } = await import('@flowspec/registry');
      const repoRoot = path.dirname(dir);
      let removed = false;
      for (const r of [repoRoot, process.cwd()]) {
        try {
          const ws = loadWorkspace(r);
          if (id in ws.entries) {
            removed = removeEntry('workspace', id, r);
            break;
          }
        } catch {}
      }
      // try fallback root
      if (!removed) {
        try { removed = removeEntry('workspace', id, repoRoot); } catch {}
      }
      if (!removed) return reply.code(404).send({ ok: false, error: `id not in workspace: ${id}` });
      return reply.send({ ok: true, id });
    } catch (e: unknown) {
      return reply.code(500).send({ ok: false, error: toApiError(e) });
    }
  });

  // REST: GET spec — 兼容前端默认 dir=flowspec 与 --dir 绝对路径不一致，自动回退到 flowspecDir
  app.get('/api/flow-spec/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const hiddenDir = getHiddenDirParam(req as unknown as { query?: Record<string, string>; headers?: Record<string, string | string[] | undefined> });
    const raw = loadSpecRaw(decodedId, dir);
    const specPath = resolveSpecPath(decodedId, dir);
    const lockPath = resolveLockPath(decodedId, dir, hiddenDir ? { hiddenDir } : undefined);
    const lock = getLockStatus(decodedId, dir, hiddenDir);
    const rawContent = readRawSpecContent(specPath);
    if (!raw) {
      if (rawContent !== null && !isMarkdownFlowSpec(rawContent)) {
        const {
          spec: emptySpec,
          bodyMarkdown,
          frontmatter,
        } = getEmptySpecForPureMarkdown(rawContent, decodedId);
        return reply.send({
          id: decodedId,
          specPath,
          lockPath,
          spec: emptySpec,
          lock,
          bodyMarkdown,
          frontmatter,
        });
      }
      return reply.code(404).send({ error: `flowspec "${decodedId}" not found` });
    }
    const parsed = flowSpecSchema.safeParse(raw);
    if (!parsed.success)
      return reply.code(500).send({ error: `invalid spec: ${parsed.error.message}` });
    const { bodyMarkdown, frontmatter } = resolveSpecBodyAndFrontmatter(raw, rawContent);
    return reply.send({
      id: decodedId,
      specPath,
      lockPath,
      spec: parsed.data,
      lock,
      bodyMarkdown,
      frontmatter,
    });
  });

  // REST: PUT spec — 回退逻辑同 GET，透传 bodyMarkdown 与 frontmatter 锁
  app.put('/api/flow-spec/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const hiddenDir = getHiddenDirParam(req as unknown as { query?: Record<string, string>; headers?: Record<string, string | string[] | undefined> });
    const body = req.body as Record<string, unknown> | undefined;
    const holder =
      (req.headers['x-flow-lock-holder'] as string | undefined) ??
      (req.headers['x-holder'] as string | undefined) ??
      (body?.holder as string | undefined);
    const lock = getLockStatus(decodedId, dir, hiddenDir);
    if (lock.locked && holder && lock.info.holder !== holder) {
      return reply.code(409).send({ error: `locked by "${lock.info.holder}"` });
    }
    const candidate = (body?.spec as unknown) ?? body;
    const parsed = flowSpecSchema.safeParse(candidate);
    if (!parsed.success)
      return reply.code(400).send({ error: `invalid FlowSpec: ${parsed.error.message}` });
    const incomingBodyMarkdown =
      typeof body?.bodyMarkdown === 'string' ? (body.bodyMarkdown as string) : undefined;
    const incomingLock =
      body?.frontmatter && typeof body.frontmatter === 'object'
        ? (body.frontmatter as Record<string, unknown>)
        : body?.lock && typeof body.lock === 'object'
          ? (body.lock as Record<string, unknown>)
          : undefined;
    const dataToSave: Record<string, unknown> = { ...parsed.data } as Record<string, unknown>;
    if (incomingBodyMarkdown !== undefined) dataToSave.bodyMarkdown = incomingBodyMarkdown;
    if (incomingLock !== undefined) dataToSave.lock = incomingLock;
    const savedPath = saveSpecRaw(decodedId, dataToSave as unknown, dir);
    let latestBody = incomingBodyMarkdown ?? '';
    let latestFm: unknown = incomingLock ?? null;
    try {
      const rawSaved = fs.readFileSync(savedPath, 'utf-8');
      const parsedSaved = parseFlowSpecFromMarkdown(rawSaved);
      if (parsedSaved) {
        latestBody = parsedSaved.bodyMarkdown;
        latestFm = parsedSaved.lock;
      } else {
        latestBody = extractBodyMarkdown(rawSaved);
        latestFm = readLockFromMarkdown(rawSaved);
      }
    } catch {}
    broadcast(decodedId, dir, {
      type: 'spec',
      spec: parsed.data,
      lock: getLockStatus(decodedId, dir, hiddenDir),
      bodyMarkdown: latestBody,
      frontmatter: latestFm,
    });
    if (lock.locked && holder && lock.info.holder === holder) {
      try {
        releaseLock(decodedId, holder, { flowspecDir: dir, hiddenDir });
      } catch {}
    }
    ensureFileWatcher(decodedId, dir);
    return reply.send({
      ok: true,
      id: decodedId,
      specPath: savedPath,
      lock: getLockStatus(decodedId, dir, hiddenDir),
      bodyMarkdown: latestBody,
      frontmatter: latestFm,
    });
  });

  // lock REST
  app.get('/api/flow-spec/:id/lock', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const hiddenDir = getHiddenDirParam(req as unknown as { query?: Record<string, string>; headers?: Record<string, string | string[] | undefined> });
    const status = getLockStatus(decodedId, dir, hiddenDir);
    return reply.send({
      id: decodedId,
      specPath: resolveSpecPath(decodedId, dir),
      lockPath: resolveLockPath(decodedId, dir, hiddenDir ? { hiddenDir } : undefined),
      ...status,
    });
  });

  app.post('/api/flow-spec/:id/lock', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const hiddenDir = getHiddenDirParam(req as unknown as { query?: Record<string, string>; headers?: Record<string, string | string[] | undefined> });
    const body = req.body as { holder?: string; note?: string; force?: boolean; hiddenDir?: string } | undefined;
    const holder = body?.holder ?? `web:${Date.now()}`;
    const bodyHidden = (body?.hiddenDir as string | undefined) ?? hiddenDir;
    try {
      const info = acquireLock(decodedId, holder, {
        ...(body?.note ? { note: body.note } : {}),
        ...(body?.force !== undefined ? { force: body.force } : {}),
        flowspecDir: dir,
        ...(bodyHidden ? { hiddenDir: bodyHidden } : {}),
      });
      const lock = getLockStatus(decodedId, dir, bodyHidden);
      broadcast(decodedId, dir, { type: 'lock', lock });
      ensureFileWatcher(decodedId, dir);
      return reply.send({
        ok: true,
        locked: true,
        id: decodedId,
        info,
        specPath: resolveSpecPath(decodedId, dir),
        lockPath: resolveLockPath(decodedId, dir, bodyHidden ? { hiddenDir: bodyHidden } : undefined),
      });
    } catch (e: unknown) {
      const msg = toApiError(e);
      return reply.code(409).send({ error: msg });
    }
  });

  app.delete('/api/flow-spec/:id/lock', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const hiddenDir = getHiddenDirParam(req as unknown as { query?: Record<string, string>; headers?: Record<string, string | string[] | undefined> });
    const body = req.body as { holder?: string; force?: boolean; hiddenDir?: string } | undefined;
    const holder =
      body?.holder ??
      ((req.query as Record<string, string> | undefined)?.holder as string | undefined);
    const forceRaw = body?.force ?? (req.query as Record<string, string> | undefined)?.force;
    const needForce = forceRaw === true || (forceRaw as unknown) === 'true' || !holder;
    const bodyHidden = (body?.hiddenDir as string | undefined) ?? hiddenDir;
    try {
      releaseLock(decodedId, holder, { force: needForce, flowspecDir: dir, ...(bodyHidden ? { hiddenDir: bodyHidden } : {}) });
      broadcast(decodedId, dir, { type: 'lock', lock: getLockStatus(decodedId, dir, bodyHidden) });
      return reply.send({
        ok: true,
        locked: false,
        id: decodedId,
        specPath: resolveSpecPath(decodedId, dir),
        lockPath: resolveLockPath(decodedId, dir, bodyHidden ? { hiddenDir: bodyHidden } : undefined),
      });
    } catch (e: unknown) {
      const msg = toApiError(e);
      return reply.code(409).send({ error: msg });
    }
  });
}
