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

export function registerFlowSpecRoutes(app: FastifyInstance, flowspecDir: string): void {
  // REST: GET list — 供多标签页左侧菜单自动读取 ./flowspec 下 json
  app.get('/api/flow-spec', async (req, reply) => {
    const dirParam = resolveFlowspecDir(
      (req.query as Record<string, string> | undefined)?.dir as string | undefined,
      flowspecDir
    );
    const dir = path.resolve(dirParam);
    let entries: Array<{ id: string; title: string; path: string; rootId: string }> = [];
    try {
      const { loadMark } = await import('@flowspec/registry');
      const repoRoot = path.dirname(dir);
      for (const r of [process.cwd(), repoRoot]) {
        try {
          const reg = loadMark(r);
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
    if (entries.length === 0 && fs.existsSync(dir)) {
      const walk = (d: string): string[] => {
        const out: string[] = [];
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) out.push(...walk(p));
          else if (e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.json'))) out.push(p);
        }
        return out;
      };
      for (const p of walk(dir)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          let parsed: unknown = null;
          if (p.endsWith('.md') && isMarkdownFlowSpec(raw)) parsed = parseFlowSpecFromMarkdown(raw);
          else if (p.endsWith('.json')) {
            try {
              parsed = JSON.parse(raw);
            } catch {}
          }
          const v = parsed ? flowSpecSchema.safeParse(parsed) : null;
          if (v?.success) {
            const rel = path.relative(process.cwd(), p).split(path.sep).join('/');
            const id = path.basename(p, path.extname(p));
            entries.push({ id, title: v.data.title, path: rel, rootId: v.data.rootId });
          }
        } catch {}
      }
    }
    return reply.send({ ok: true, dir, entries });
  });

  // REST: GET spec — 兼容前端默认 dir=flowspec 与 --dir 绝对路径不一致，自动回退到 flowspecDir
  app.get('/api/flow-spec/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const raw = loadSpecRaw(decodedId, dir);
    const specPath = resolveSpecPath(decodedId, dir);
    const lockPath = resolveLockPath(decodedId, dir);
    const lock = getLockStatus(decodedId, dir);
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
    const body = req.body as Record<string, unknown> | undefined;
    const holder =
      (req.headers['x-flow-lock-holder'] as string | undefined) ??
      (req.headers['x-holder'] as string | undefined) ??
      (body?.holder as string | undefined);
    const lock = getLockStatus(decodedId, dir);
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
      lock: getLockStatus(decodedId, dir),
      bodyMarkdown: latestBody,
      frontmatter: latestFm,
    });
    if (lock.locked && holder && lock.info.holder === holder) {
      try {
        releaseLock(decodedId, holder, { flowspecDir: dir });
      } catch {}
    }
    ensureFileWatcher(decodedId, dir);
    return reply.send({
      ok: true,
      id: decodedId,
      specPath: savedPath,
      lock: getLockStatus(decodedId, dir),
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
    const status = getLockStatus(decodedId, dir);
    return reply.send({
      id: decodedId,
      specPath: resolveSpecPath(decodedId, dir),
      lockPath: resolveLockPath(decodedId, dir),
      ...status,
    });
  });

  app.post('/api/flow-spec/:id/lock', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decodedId = decodeURIComponent(id);
    const dirParam =
      ((req.query as Record<string, string> | undefined)?.dir as string | undefined) ?? flowspecDir;
    const dir = resolveEffectiveDir(decodedId, dirParam, flowspecDir);
    const body = req.body as { holder?: string; note?: string; force?: boolean } | undefined;
    const holder = body?.holder ?? `web:${Date.now()}`;
    try {
      const info = acquireLock(decodedId, holder, {
        ...(body?.note ? { note: body.note } : {}),
        ...(body?.force !== undefined ? { force: body.force } : {}),
        flowspecDir: dir,
      });
      const lock = getLockStatus(decodedId, dir);
      broadcast(decodedId, dir, { type: 'lock', lock });
      ensureFileWatcher(decodedId, dir);
      return reply.send({
        ok: true,
        locked: true,
        id: decodedId,
        info,
        specPath: resolveSpecPath(decodedId, dir),
        lockPath: resolveLockPath(decodedId, dir),
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
    const body = req.body as { holder?: string; force?: boolean } | undefined;
    const holder =
      body?.holder ??
      ((req.query as Record<string, string> | undefined)?.holder as string | undefined);
    const forceRaw = body?.force ?? (req.query as Record<string, string> | undefined)?.force;
    const needForce = forceRaw === true || (forceRaw as unknown) === 'true' || !holder;
    try {
      releaseLock(decodedId, holder, { force: needForce, flowspecDir: dir });
      broadcast(decodedId, dir, { type: 'lock', lock: getLockStatus(decodedId, dir) });
      return reply.send({
        ok: true,
        locked: false,
        id: decodedId,
        specPath: resolveSpecPath(decodedId, dir),
        lockPath: resolveLockPath(decodedId, dir),
      });
    } catch (e: unknown) {
      const msg = toApiError(e);
      return reply.code(409).send({ error: msg });
    }
  });
}
